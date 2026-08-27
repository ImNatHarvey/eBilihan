import { emessageClient } from "./httpClients.js";
import { config } from "../config.js";

/**
 * eMessage is a raw SMS/email/in-app delivery API — it has no concept of "OTP".
 * Any OTP generation, storage, and expiry logic is eBilihan's own responsibility
 * (see routes/auth.ts registrationOtps); this only pushes the text message.
 */
export async function sendSms(numberE164: string, message: string): Promise<void> {
  /**
   * Test builds do not send, and do not bill.
   *
   * The sandbox numbers eGovPH issues (+639090000001..5) accept a push and return 201
   * without delivering anything, so locally every send is a credit spent on a message no
   * handset will ever receive. Confirmed against the portal log: one 201, no SMS.
   *
   * Gated on the same flag as the seeded borrower, so a test run costs nothing end to end.
   * This is the single chokepoint for eMessage — suppressing it here covers the loan OTP
   * and the agreement notification together, and covers any later caller without that
   * caller having to remember. With the flag off nothing below changes: production sends
   * for real.
   *
   * Neither the number nor the body is logged. The OTP route prints its own code, which is
   * the one value a local tester actually needs; the rest is still PII and still has no
   * business in a log.
   */
  if (config.allowTestVerification) {
    // eslint-disable-next-line no-console
    console.warn("[dev] eMessage send suppressed — ALLOW_TEST_VERIFICATION is on. No SMS, no credit.");
    return;
  }

  await emessageClient.post(
    "/messaging/v1/sms/push",
    { number: numberE164, message },
    { headers: { "X-EMESSAGE-Auth": config.emessage.apiToken, "Content-Type": "application/json" } },
  );
  // Deliberately logs nothing. eMessage accepts a message and returns 201 whether or not
  // it will actually deliver it, so a success log here would be misleading anyway — and
  // an earlier version printed the recipient's phone number, which has no business in
  // server logs. Failures are logged with the gateway's own body by the caller's
  // sendUpstreamError (lib/upstreamError.ts), without the number.
}
