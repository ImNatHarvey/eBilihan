import { Router } from "express";
import { customAlphabet } from "nanoid";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { everifyClient } from "../lib/httpClients.js";
import { getCachedToken } from "../lib/tokenCache.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { loans, owners, pendingOtps, type Loan } from "../store/db.js";
import { appendTransaction } from "../lib/egovchain.js";
import { sendSms } from "../lib/emessage.js";

const router = Router();
router.use(requireAuth);
const generateOtp = customAlphabet("0123456789", 6);

async function getEverifyAccessToken(): Promise<string> {
  return getCachedToken("everify", async () => {
    const res = await everifyClient.post("/api/auth", {
      client_id: config.everify.clientId,
      client_secret: config.everify.clientSecret,
    });
    const { access_token, expires_at } = res.data.data as { access_token: string; expires_at: string };
    return { token: access_token, expiresAtMs: Number(expires_at) * 1000 };
  });
}

/**
 * Verifies a borrower before a loan can be created: scans the borrower's eGovPH QR
 * code and matches it against a face_liveness_session_id captured moments earlier via
 * the eVerify Face Liveness Web SDK (window.eKYC().start()). This is the "strict
 * identification" step from the project brief — see eVerify > QR Verify.
 *
 * A borrower only clears this check (and therefore can be loaned to) when eVerify
 * returns a matched profile with code "AAA001" — the "Success (Matched)" example
 * response. Any other code (e.g. face mismatch) must block loan creation.
 *
 * NOT currently called by LoanVerificationFlow.tsx — per explicit request, that flow
 * uses a hardcoded demo borrower + a real front-camera capture that always succeeds
 * instead (real eVerify matching needs a working EVERIFY_PUBKEY + a QR the demo
 * account is actually eVerify-linked to). Kept working and available for when that's
 * viable; see DEMO_BORROWER_PROFILE in LoanVerificationFlow.tsx.
 */
router.post("/verify-borrower", async (req, res) => {
  const { qrValue, faceLivenessSessionId } = req.body as { qrValue: string; faceLivenessSessionId: string };
  if (!qrValue || !faceLivenessSessionId) {
    return res.status(422).json({ error: "qrValue and faceLivenessSessionId are required" });
  }
  try {
    const accessToken = await getEverifyAccessToken();
    const response = await everifyClient.post(
      "/api/query/qr",
      { value: qrValue, face_liveness_session_id: faceLivenessSessionId },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const matched = response.data?.data?.code === "AAA001";
    res.json({ matched, profile: response.data?.data });
  } catch (err) {
    res.status(502).json({ error: "eVerify QR verify failed", detail: (err as Error).message });
  }
});

function buildTermsOfPayment(principal: number, borrowerName: string, dueDateIso: string): string {
  const dueDate = new Date(dueDateIso);
  return [
    `TERMS OF PAYMENT AND LOAN AGREEMENT`,
    ``,
    `Borrower: ${borrowerName}`,
    `Principal amount: PHP ${principal.toFixed(2)}`,
    `Due date: ${dueDate.toLocaleDateString("en-PH")}`,
    ``,
    `The borrower agrees to settle the full principal amount on or before the due date`,
    `stated above. Failure to pay by the due date may result in suspension of further`,
    `credit ("pautang") privileges at this store and continued collection follow-up.`,
    `This agreement is recorded against the borrower's verified eGovPH identity.`,
  ].join("\n");
}

router.get("/", (req, res) => {
  const list = [...loans.values()].filter((l) => l.ownerId === req.ownerId);
  res.json({ data: list });
});

type LoanPayload = {
  borrowerEgovphUniqid: string;
  borrowerName: string;
  borrowerPhilsysNumber: string;
  borrowerMobile: string;
  principal: number;
  dueDate: string;
};

function createLoanRecord(ownerId: string, payload: LoanPayload): Loan {
  const owner = owners.get(ownerId);
  const termsOfPaymentText = buildTermsOfPayment(payload.principal, payload.borrowerName, payload.dueDate);

  const loan: Loan = {
    id: randomUUID(),
    ownerId,
    borrowerEgovphUniqid: payload.borrowerEgovphUniqid,
    borrowerName: payload.borrowerName,
    borrowerPhilsysNumber: payload.borrowerPhilsysNumber,
    principal: payload.principal,
    balance: payload.principal,
    termsOfPaymentText,
    status: "active",
    createdAt: new Date().toISOString(),
  };
  loans.set(loan.id, loan);
  appendTransaction({ ownerId, type: "loan_issued", loanId: loan.id, principal: payload.principal });

  const dueDateLabel = new Date(payload.dueDate).toLocaleDateString("en-PH");
  if (payload.borrowerMobile) {
    sendSms(
      payload.borrowerMobile,
      `${owner?.storeName ?? "Your sari-sari store"} recorded a loan of PHP ${payload.principal.toFixed(2)} under your name. Due ${dueDateLabel}. Reply to this store for full terms.`,
    ).catch(() => undefined);
  }
  if (owner?.mobile) {
    sendSms(owner.mobile, `Loan agreement created for ${payload.borrowerName}: PHP ${payload.principal.toFixed(2)}, due ${dueDateLabel}.`).catch(() => undefined);
  }

  return loan;
}

/**
 * OTP-gated loan creation: send a code to the number that'll receive the loan
 * agreement SMS (the store owner confirms it, same "prove control of this number"
 * pattern as login/registration — see pendingOtps in store/db.ts) before the loan is
 * actually recorded.
 */
router.post("/otp/start", async (req, res) => {
  const { mobile } = req.body as { mobile?: string };
  if (!mobile) return res.status(422).json({ error: "mobile is required" });

  const otp = generateOtp();
  pendingOtps.set(mobile, { otp, expiresAtMs: Date.now() + 5 * 60_000 });
  try {
    await sendSms(mobile, `Your eBilihan loan confirmation code is ${otp}. It expires in 5 minutes.`);
    res.json({ message: `OTP sent to ${mobile}` });
  } catch (err) {
    res.status(502).json({ error: "Could not send OTP via eMessage", detail: (err as Error).message });
  }
});

router.post("/otp/confirm", async (req, res) => {
  const { mobile, otp, ...payload } = req.body as { mobile?: string; otp?: string } & LoanPayload;
  if (!mobile || !otp) return res.status(422).json({ error: "mobile and otp are required" });
  if (!payload.borrowerEgovphUniqid || !payload.borrowerName || !payload.principal || !payload.dueDate) {
    return res.status(422).json({ error: "borrowerEgovphUniqid, borrowerName, principal, and dueDate are required" });
  }

  const pending = pendingOtps.get(mobile);
  if (!pending || pending.otp !== otp || pending.expiresAtMs < Date.now()) {
    return res.status(401).json({ error: "Invalid or expired OTP" });
  }
  pendingOtps.delete(mobile);

  const loan = createLoanRecord(req.ownerId!, payload);
  res.status(201).json({ data: loan });
});

/** Direct (non-OTP-gated) creation — kept for API completeness; the UI now goes through /otp/start + /otp/confirm above. */
router.post("/", async (req, res) => {
  const body = req.body as LoanPayload;
  if (!body.borrowerEgovphUniqid || !body.borrowerName || !body.principal) {
    return res.status(422).json({ error: "borrowerEgovphUniqid, borrowerName, and principal are required" });
  }
  const dueDate = body.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const loan = createLoanRecord(req.ownerId!, { ...body, dueDate });
  res.status(201).json({ data: loan });
});

router.put("/:id", (req, res) => {
  const existing = loans.get(req.params.id);
  if (!existing || existing.ownerId !== req.ownerId) return res.status(404).json({ error: "Loan not found" });
  const updated: Loan = { ...existing, ...req.body, id: existing.id, ownerId: existing.ownerId };
  loans.set(updated.id, updated);
  res.json({ data: updated });
});

router.delete("/:id", (req, res) => {
  const existing = loans.get(req.params.id);
  if (!existing || existing.ownerId !== req.ownerId) return res.status(404).json({ error: "Loan not found" });
  loans.delete(req.params.id);
  res.status(204).end();
});

export default router;
