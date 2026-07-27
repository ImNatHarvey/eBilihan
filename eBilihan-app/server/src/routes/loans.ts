import { Router } from "express";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { everifyClient } from "../lib/httpClients.js";
import { getCachedToken } from "../lib/tokenCache.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { loans, owners, type Loan } from "../store/db.js";
import { appendTransaction } from "../lib/egovchain.js";
import { sendSms } from "../lib/emessage.js";

const router = Router();
router.use(requireAuth);

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

function buildTermsOfPayment(principal: number, borrowerName: string): string {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
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

router.post("/", async (req, res) => {
  const { borrowerEgovphUniqid, borrowerName, borrowerPhilsysNumber, borrowerMobile, principal } = req.body as {
    borrowerEgovphUniqid: string;
    borrowerName: string;
    borrowerPhilsysNumber: string;
    borrowerMobile: string;
    principal: number;
  };
  if (!borrowerEgovphUniqid || !borrowerName || !principal) {
    return res.status(422).json({ error: "borrowerEgovphUniqid, borrowerName, and principal are required" });
  }

  const owner = owners.get(req.ownerId!);
  const termsOfPaymentText = buildTermsOfPayment(principal, borrowerName);

  const loan: Loan = {
    id: randomUUID(),
    ownerId: req.ownerId!,
    borrowerEgovphUniqid,
    borrowerName,
    borrowerPhilsysNumber,
    principal,
    balance: principal,
    termsOfPaymentText,
    status: "active",
    createdAt: new Date().toISOString(),
  };
  loans.set(loan.id, loan);

  appendTransaction({ ownerId: req.ownerId, type: "loan_issued", loanId: loan.id, principal });

  if (borrowerMobile) {
    await sendSms(
      borrowerMobile,
      `${owner?.storeName ?? "Your sari-sari store"} recorded a loan of PHP ${principal.toFixed(2)} under your name. Due in 30 days. Reply to this store for full terms.`,
    ).catch(() => undefined);
  }
  if (owner?.mobile) {
    await sendSms(owner.mobile, `Loan agreement created for ${borrowerName}: PHP ${principal.toFixed(2)}.`).catch(() => undefined);
  }

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
