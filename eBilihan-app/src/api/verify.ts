import { api } from "./client";

export async function getEverifyPubKey() {
  const { data } = await api.get<{ pubKey: string }>("/verify/pubkey");
  return data.pubKey;
}

export async function qrCheck(value: string) {
  const { data } = await api.post("/verify/qr-check", { value });
  return data;
}

export async function qrVerify(value: string, faceLivenessSessionId: string) {
  const { data } = await api.post("/verify/qr-verify", { value, faceLivenessSessionId });
  return data;
}
