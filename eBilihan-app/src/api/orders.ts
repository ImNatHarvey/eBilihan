import { api } from "./client";
import type { Order, OrderItem } from "@/types";

export async function listOrders() {
  const { data } = await api.get<{ data: Order[] }>("/orders");
  return data.data;
}

export async function createOrder(items: OrderItem[], paymentMethod: "cash" | "gcash") {
  const { data } = await api.post<{ data: Order }>("/orders", { items, paymentMethod });
  return data.data;
}

export async function markOrderPaymentStatus(id: string, paymentStatus: Order["paymentStatus"], egovpayTransactionUuid?: string) {
  const { data } = await api.patch<{ data: Order }>(`/orders/${id}`, { paymentStatus, egovpayTransactionUuid });
  return data.data;
}
