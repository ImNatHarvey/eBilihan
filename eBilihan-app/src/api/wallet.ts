import { api } from "./client";
import type { WalletSummary } from "@/types";

export async function getWalletSummary() {
  const { data } = await api.get<{ data: WalletSummary }>("/wallet/summary");
  return data.data;
}
