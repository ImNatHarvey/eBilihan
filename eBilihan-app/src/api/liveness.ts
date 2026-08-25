import { api } from "./client";
import type { LivenessVerdict } from "@/types";

/**
 * The standalone Face Liveness REST product, proxied through our backend. Distinct from
 * eVerify's embedded Face Liveness Web SDK (src/lib/everifyFaceLiveness.ts) — the two
 * mint session tokens in separate namespaces and are not interchangeable.
 */
export async function createLivenessSession(callbackUrl?: string) {
  const { data } = await api.post<{ token: string; url: string }>("/liveness/session", {
    action: "redirect",
    callbackUrl,
  });
  return data;
}

/**
 * The pass/fail decision is made server-side against the documented 95.0 threshold —
 * this returns that verdict, not a raw score to re-interpret here. On a pass the server
 * also records the check, and hands back `livenessToken` as proof to attach to a
 * high-value loan.
 */
export async function getLivenessResult(sessionToken: string) {
  const { data } = await api.get<LivenessVerdict>(`/liveness/result/${sessionToken}`);
  return data;
}
