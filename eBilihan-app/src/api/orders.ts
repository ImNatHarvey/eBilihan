import { api } from "./client";
import type { CartLine, Order } from "@/types";

export async function listOrders() {
  const { data } = await api.get<{ data: Order[] }>("/orders");
  return data.data;
}

/**
 * Only product ids and quantities are sent. Prices and names are looked up server-side
 * from the stored product, so the total written to the ledger is never a figure this
 * device supplied.
 */
export async function createOrder(items: CartLine[], paymentMethod: "cash" | "gcash") {
  const lines = items.map((i) => ({ productId: i.productId, quantity: i.quantity }));
  const { data } = await api.post<{ data: Order }>("/orders", { items: lines, paymentMethod });
  return data.data;
}

/**
 * Asks the server to re-check this order against eGovPay and settle it if the gateway says
 * it's paid. Takes no payment status — that is eGovPay's word alone, never ours. (The old
 * `markOrderPaymentStatus` sent `paymentStatus` directly, which let any caller mark an
 * order paid with no money having moved.)
 */
export async function refreshOrderPayment(id: string) {
  const { data } = await api.post<{ data: Order; paymentStatus: string }>(`/orders/${id}/refresh-payment`);
  return data;
}
