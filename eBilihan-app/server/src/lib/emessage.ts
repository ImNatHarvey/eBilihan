import { emessageClient } from "./httpClients.js";
import { config } from "../config.js";

/**
 * eMessage is a raw SMS/email/in-app delivery API — it has no concept of "OTP".
 * Any OTP generation, storage, and expiry logic is eBilihan's own responsibility
 * (see routes/auth.ts registrationOtps); this only pushes the text message.
 */
export async function sendSms(numberE164: string, message: string): Promise<void> {
  await emessageClient.post(
    "/messaging/v1/sms/push",
    { number: numberE164, message },
    { headers: { "X-EMESSAGE-Auth": config.emessage.apiToken, "Content-Type": "application/json" } },
  );
}
