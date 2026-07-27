import { api } from "./client";

export type GeneratePaymentInput = {
  amount: number;
  items: { name: string; amount: number }[];
  txnid: string;
  mobile?: string;
  email?: string;
  name?: string;
  redirectUrl: string;
  callbackUrl: string;
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
