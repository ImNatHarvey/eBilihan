import { api } from "./client";
import type { BorrowerVerification, Loan } from "@/types";

export type BorrowerDemographics = {
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  birthDate: string;
};

/**
 * eVerify > QR Verify: the borrower's scanned National ID QR matched against a live
 * face-liveness session.
 *
 * On a match the server keeps the verified identity itself and returns only an opaque
 * `verificationId`. The borrower's name comes back for display, but it is *not* what
 * creates the loan — see `loanOtpConfirm`.
 */
export async function verifyBorrower(qrValue: string, faceLivenessSessionId: string) {
  const { data } = await api.post<BorrowerVerification>("/loans/verify-borrower", {
    qrValue,
    faceLivenessSessionId,
  });
  return data;
}

/** eVerify > Verify Personal Information: the same check for a card that won't scan. */
export async function verifyBorrowerByDetails(details: BorrowerDemographics, faceLivenessSessionId: string) {
  const { data } = await api.post<BorrowerVerification>("/loans/verify-borrower/personal", {
    ...details,
    faceLivenessSessionId,
  });
  return data;
}

/**
 * Test-only: mint a verification record for a fictional borrower, so the OTP, loan
 * creation, the agreement PDF and the eMessage send can be exercised without a real ID, a
 * real face, and a portal credit each time.
 *
 * The server returns the same shape as a real match, so callers can feed it through the
 * same funnel — there is deliberately no second code path, and the thing under test stays
 * the real one.
 *
 * 404s unless the server runs with ALLOW_TEST_VERIFICATION=true, which is never set on
 * Render. Call it only from behind `import.meta.env.DEV` so it cannot be reached from a
 * production build either.
 */
export async function seedTestVerification() {
  const { data } = await api.post<BorrowerVerification>("/loans/dev/seed-verification");
  return data;
}

export async function listLoans() {
  const { data } = await api.get<{ data: Loan[] }>("/loans");
  return data.data;
}

/**
 * What this device is allowed to say about a loan. The borrower's identity is absent on
 * purpose — the server reads it from the verification record named by `verificationId`,
 * so a loan cannot be opened against someone eVerify never matched.
 */
export type LoanInput = {
  verificationId: string;
  principal: number;
  dueDate: string;
  /** Required only for loans at or above the server's high-value threshold. */
  livenessToken?: string;
};

/** Sends a confirmation code to the owner's own eGovPH-linked mobile. */
export async function loanOtpStart() {
  const { data } = await api.post<{ message: string }>("/loans/otp/start");
  return data;
}

export async function loanOtpConfirm(otp: string, input: LoanInput) {
  const { data } = await api.post<{ data: Loan }>("/loans/otp/confirm", { otp, ...input });
  return data.data;
}

/** Records a repayment. The server decides what it does to the balance and status. */
export async function recordRepayment(id: string, amount: number) {
  const { data } = await api.post<{ data: Loan }>(`/loans/${id}/repayment`, { amount });
  return data.data;
}

export async function markLoanDefaulted(id: string) {
  const { data } = await api.post<{ data: Loan }>(`/loans/${id}/default`);
  return data.data;
}
