import { api } from "./client";

/**
 * Just the order id. Everything else eGovPay needs is derived server-side:
 *
 *  - `amount`, `items`, `txnid` come from the stored order, so the sum a customer is asked
 *    to pay is never a figure this device supplied;
 *  - `redirect_url` and `callback_url` come from the server's configured public origins —
 *    the app can't know this backend's externally reachable URL, and eGovPay types both as
 *    `url`, so a custom app scheme is rejected;
 *  - `digest` is an HMAC keyed by the merchant token, which never leaves the server.
 */
export type GeneratePaymentInput = {
  orderId: string;
};

/** eGovPay > Generate Payment (proxied): returns a hosted payment-gateway link for GCash checkout. */
export async function generatePayment(input: GeneratePaymentInput) {
  const { data } = await api.post<{ data: { uuid: string; url: string; channel: { refno: string } } }>(
    "/payments/generate",
    input,
  );
  return data.data;
}

export async function checkTransaction(uuid: string) {
  const { data } = await api.get<{ data: { payment_status: string; amount: string } }>(`/payments/${uuid}`);
  return data.data;
}

export async function voidTransaction(uuid: string) {
  const { data } = await api.put<{ data: { message: string } }>(`/payments/${uuid}/void`, {});
  return data.data;
}
