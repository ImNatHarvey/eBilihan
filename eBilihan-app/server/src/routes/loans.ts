import { Router } from "express";
import { customAlphabet } from "nanoid";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { everifyClient } from "../lib/httpClients.js";
import { getCachedToken } from "../lib/tokenCache.js";
import { sendUpstreamError } from "../lib/upstreamError.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { expensiveRateLimit } from "../middleware/rateLimit.js";
import {
  loans,
  owners,
  pendingOtps,
  passedLivenessChecks,
  pruneExpired,
  verifiedBorrowers,
  VERIFICATION_TTL_MS,
  type Loan,
} from "../store/db.js";
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
 * eVerify's matched-result codes, per the portal's own answer: both mean a successful
 * biometric + demographic match, and they differ only by how the demographics arrived.
 *
 *   AAA000 — POST /api/query      (typed demographics)
 *   AAA001 — POST /api/query/qr   (demographics read from the National ID QR)
 *
 * Each endpoint therefore expects exactly one of them, which is why the code is passed in
 * per call rather than checked against a shared set.
 */
const MATCH_CODE_DEMOGRAPHIC = "AAA000";
const MATCH_CODE_QR = "AAA001";

type EverifyMatch = {
  code?: string;
  full_name?: string;
  reference?: string;
  token?: string;
  verified?: boolean;
  [key: string]: unknown;
};

/** `meta` on a verify response — carries the grade when a check fails rather than errors. */
type EverifyMeta = { tier_level?: string; result_grade?: string; [key: string]: unknown };

/**
 * Turns an eVerify response into a verdict AND, when matched, a server-held record the
 * client cannot forge. The client only ever receives `verificationId` plus a name to
 * display — never anything it can substitute at loan-creation time.
 */
function recordVerification(
  ownerId: string,
  data: EverifyMatch | undefined,
  meta: EverifyMeta | undefined,
  expectedCode: string,
  livenessSessionId: string,
  fallbackIdentifier: string,
) {
  /**
   * Three independent ways to be "not matched", all of which must block the loan:
   *
   *  1. The code isn't the one this endpoint returns on success.
   *  2. `verified` is explicitly false.
   *  3. `meta.result_grade` reports a failure (e.g. "FAILED_FACE").
   *
   * (2) and (3) matter because a face mismatch does NOT come back as a different code —
   * it comes back with no `code` field at all:
   *   {"data":{"verified":false},"meta":{"tier_level":"Tier II","result_grade":"FAILED_FACE"}}
   * The code check alone already fails closed on that, since `undefined !== expectedCode`.
   * These are belt-and-braces: a response that says "not verified" must never be read as a
   * match, whatever else it contains.
   */
  const gradeFailed = typeof meta?.result_grade === "string" && meta.result_grade.toUpperCase().startsWith("FAILED");
  const matched = data?.code === expectedCode && data?.verified !== false && !gradeFailed;

  /**
   * Log the verdict inputs — never the identity.
   *
   * `sendUpstreamError` only fires on a non-2xx, so a successful eVerify call that simply
   * did not match left no trace at all: the response body was never recorded anywhere, and
   * re-running the flow to see it costs a credit. `code` and `result_grade` are status
   * values, not personal data; `full_name` is, so only its presence is recorded.
   */
  // eslint-disable-next-line no-console
  console.info(
    `[eVerify] verdict: matched=${matched} code=${data?.code ?? "none"} expected=${expectedCode} ` +
      `verified=${data?.verified ?? "absent"} grade=${meta?.result_grade ?? "none"} hasName=${!!data?.full_name}`,
  );

  if (!matched || !data?.full_name) {
    return {
      matched: false as const,
      // "rejected" means eVerify looked and said no — a real finding about a real person.
      // It is deliberately distinct from a liveness check that never completed, which
      // never reaches this function at all.
      reason: "eVerify could not match this person to the presented identity.",
    };
  }

  const verificationId = randomUUID();
  verifiedBorrowers.set(verificationId, {
    ownerId,
    borrowerName: data.full_name,
    borrowerEgovphUniqid: String(data.reference ?? fallbackIdentifier),
    borrowerPhilsysNumber: fallbackIdentifier,
    livenessSessionId,
    expiresAtMs: Date.now() + VERIFICATION_TTL_MS,
  });

  return { matched: true as const, verificationId, borrowerName: data.full_name };
}

/**
 * Verifies a borrower before a loan can be created: their National ID QR value plus a
 * face_liveness_session_id captured moments earlier by the eVerify Face Liveness Web SDK,
 * matched against PhilSys (eVerify > QR Verify).
 */
router.post("/verify-borrower", expensiveRateLimit, async (req, res) => {
  const { qrValue, faceLivenessSessionId } = req.body as { qrValue?: string; faceLivenessSessionId?: string };
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
    res.json(
      recordVerification(
        req.ownerId!,
        response.data?.data,
        response.data?.meta,
        MATCH_CODE_QR,
        faceLivenessSessionId,
        qrValue,
      ),
    );
  } catch (err) {
    sendUpstreamError(res, err, "Borrower verification");
  }
});

/**
 * The same check without a QR code, for a card that won't scan. Note this is the flow
 * eVerify's own documentation leads with — "submit demographics + face_liveness_session_id
 * to the Verify endpoint" — so it is the documented path, not a workaround.
 */
router.post("/verify-borrower/personal", expensiveRateLimit, async (req, res) => {
  const { firstName, middleName, lastName, suffix, birthDate, faceLivenessSessionId } = req.body as {
    firstName?: string;
    middleName?: string;
    lastName?: string;
    suffix?: string;
    birthDate?: string;
    faceLivenessSessionId?: string;
  };
  if (!firstName || !lastName || !birthDate || !faceLivenessSessionId) {
    return res.status(422).json({ error: "firstName, lastName, birthDate, and faceLivenessSessionId are required" });
  }
  try {
    const accessToken = await getEverifyAccessToken();
    const response = await everifyClient.post(
      "/api/query",
      {
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        suffix,
        birth_date: birthDate,
        face_liveness_session_id: faceLivenessSessionId,
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const identifier = `${lastName.toUpperCase()}-${birthDate}`;
    res.json(
      recordVerification(
        req.ownerId!,
        response.data?.data,
        response.data?.meta,
        MATCH_CODE_DEMOGRAPHIC,
        faceLivenessSessionId,
        identifier,
      ),
    );
  } catch (err) {
    sendUpstreamError(res, err, "Borrower verification");
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

/**
 * Everything a client is allowed to say about a loan. The borrower's identity is
 * conspicuously absent — that comes from the verification record alone.
 */
type LoanRequest = {
  verificationId: string;
  principal: number;
  dueDate: string;
  livenessToken?: string;
};

function validateLoanRequest(ownerId: string, body: Partial<LoanRequest>) {
  pruneExpired();

  const principal = Number(body.principal);
  if (!Number.isFinite(principal) || principal <= 0) {
    return { error: "A positive loan amount is required" as const };
  }
  if (!body.dueDate || Number.isNaN(new Date(body.dueDate).getTime())) {
    return { error: "A valid due date is required" as const };
  }
  if (!body.verificationId) {
    return { error: "This borrower has not been verified" as const };
  }

  const verification = verifiedBorrowers.get(body.verificationId);
  // Scoped to the owner as well as checked for existence: a verification made by one
  // store must not be usable to open a loan at another.
  if (!verification || verification.ownerId !== ownerId) {
    return { error: "This borrower has not been verified" as const };
  }
  if (verification.expiresAtMs < Date.now()) {
    return { error: "The identity check has expired — please verify the borrower again" as const };
  }

  // High-value loans additionally require the OWNER to have proved they're present.
  if (principal >= config.loans.livenessThresholdPhp) {
    const check = body.livenessToken ? passedLivenessChecks.get(body.livenessToken) : undefined;
    if (!check || check.ownerId !== ownerId || check.expiresAtMs < Date.now()) {
      return {
        error: `Loans of PHP ${config.loans.livenessThresholdPhp.toFixed(2)} or more need your own face check first` as const,
        needsOwnerLiveness: true,
      };
    }
    // Single-use: one check authorises one loan.
    passedLivenessChecks.delete(body.livenessToken!);
  }

  return { verification, principal, dueDate: body.dueDate };
}

function createLoanRecord(
  ownerId: string,
  verification: { borrowerName: string; borrowerEgovphUniqid: string; borrowerPhilsysNumber: string },
  principal: number,
  dueDate: string,
): Loan {
  const owner = owners.get(ownerId);
  const termsOfPaymentText = buildTermsOfPayment(principal, verification.borrowerName, dueDate);

  const loan: Loan = {
    id: randomUUID(),
    ownerId,
    borrowerEgovphUniqid: verification.borrowerEgovphUniqid,
    borrowerName: verification.borrowerName,
    borrowerPhilsysNumber: verification.borrowerPhilsysNumber,
    principal,
    balance: principal,
    termsOfPaymentText,
    status: "active",
    createdAt: new Date().toISOString(),
  };
  loans.set(loan.id, loan);
  appendTransaction({ ownerId, type: "loan_issued", loanId: loan.id, principal });

  const dueDateLabel = new Date(dueDate).toLocaleDateString("en-PH");
  if (owner?.mobile) {
    sendSms(
      owner.mobile,
      `Loan agreement created for ${verification.borrowerName}: PHP ${principal.toFixed(2)}, due ${dueDateLabel}.`,
    ).catch(() => undefined);
  }

  return loan;
}

/**
 * OTP-gated loan creation. The code goes to the store owner's own eGovPH-linked mobile —
 * a second factor over recording money, not an identity check (eGovPH already established
 * who they are, and eVerify established who the borrower is).
 */
router.post("/otp/start", async (req, res) => {
  const owner = owners.get(req.ownerId!)!;
  if (!owner.mobile) {
    return res.status(422).json({ error: "Your eGovPH account has no mobile number on file" });
  }

  const otp = generateOtp();
  pendingOtps.set(owner.mobile, { otp, expiresAtMs: Date.now() + 5 * 60_000 });
  try {
    await sendSms(owner.mobile, `Your eBilihan loan confirmation code is ${otp}. It expires in 5 minutes.`);
    res.json({ message: "OTP sent to your registered mobile number" });
  } catch (err) {
    sendUpstreamError(res, err, "Sending your confirmation code");
  }
});

router.post("/otp/confirm", (req, res) => {
  const owner = owners.get(req.ownerId!)!;
  const { otp, ...rest } = req.body as { otp?: string } & Partial<LoanRequest>;
  if (!otp) return res.status(422).json({ error: "otp is required" });

  const pending = owner.mobile ? pendingOtps.get(owner.mobile) : undefined;
  if (!pending || pending.otp !== otp || pending.expiresAtMs < Date.now()) {
    return res.status(422).json({ error: "Invalid or expired OTP" });
  }

  const validated = validateLoanRequest(req.ownerId!, rest);
  if ("error" in validated) {
    return res.status(422).json({ error: validated.error, needsOwnerLiveness: validated.needsOwnerLiveness });
  }

  // Only consume the OTP once the request is known-good, so a rejected loan doesn't
  // force the owner to request a fresh code.
  pendingOtps.delete(owner.mobile!);
  verifiedBorrowers.delete(rest.verificationId!);

  const loan = createLoanRecord(req.ownerId!, validated.verification, validated.principal, validated.dueDate);
  res.status(201).json({ data: loan });
});

/**
 * Records a repayment. Deliberately narrow: the client says how much was paid, and the
 * server decides what that means for the balance and status. It cannot set either
 * directly — an earlier version spread `req.body` over the loan, which let a client
 * rewrite a verified borrower's name, principal, or balance after the fact and made the
 * eVerify check decorative.
 */
router.post("/:id/repayment", (req, res) => {
  const loan = loans.get(req.params.id);
  if (!loan || loan.ownerId !== req.ownerId) return res.status(404).json({ error: "Loan not found" });

  const amount = Number((req.body as { amount?: number }).amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(422).json({ error: "A positive repayment amount is required" });
  }
  if (amount > loan.balance) {
    return res.status(422).json({ error: "Repayment is larger than the outstanding balance" });
  }

  loan.balance = Number((loan.balance - amount).toFixed(2));
  if (loan.balance === 0) loan.status = "paid";
  loans.set(loan.id, loan);
  appendTransaction({ ownerId: req.ownerId, type: "loan_repayment", loanId: loan.id, amount });

  res.json({ data: loan });
});

/** Marking a loan defaulted is the one other state change an owner may make directly. */
router.post("/:id/default", (req, res) => {
  const loan = loans.get(req.params.id);
  if (!loan || loan.ownerId !== req.ownerId) return res.status(404).json({ error: "Loan not found" });
  if (loan.status === "paid") return res.status(422).json({ error: "A settled loan can't be marked defaulted" });

  loan.status = "defaulted";
  loans.set(loan.id, loan);
  appendTransaction({ ownerId: req.ownerId, type: "loan_defaulted", loanId: loan.id, balance: loan.balance });
  res.json({ data: loan });
});

export default router;
