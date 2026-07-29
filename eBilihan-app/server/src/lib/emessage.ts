import { emessageClient } from "./httpClients.js";
import { config } from "../config.js";

/**
 * eMessage is a raw SMS/email/in-app delivery API — it has no concept of "OTP".
 * Any OTP generation, storage, and expiry logic is eBilihan's own responsibility
 * (see routes/auth.ts registrationOtps); this only pushes the text message.
 */
export async function sendSms(numberE164: string, message: string): Promise<void> {
  const res = await emessageClient.post(
    "/messaging/v1/sms/push",
    { number: numberE164, message },
    { headers: { "X-EMESSAGE-Auth": config.emessage.apiToken, "Content-Type": "application/json" } },
  );
  // TEMP DIAGNOSTIC: eMessage returns 200 even when it silently declines to deliver
  // (e.g. sandbox/whitelist restrictions) — log the body so we can see what it says.
  console.log(`[eMessage] POST /messaging/v1/sms/push -> ${numberE164}:`, JSON.stringify(res.data));
}
