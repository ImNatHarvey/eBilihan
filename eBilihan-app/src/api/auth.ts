import { api } from "./client";
import type { StoreLocation, StoreOwner } from "@/types";

export type SsoSession = {
  token: string;
  owner: StoreOwner;
  /** True on a citizen's first ever sign-in — store name and location aren't set yet. */
  needsOnboarding: boolean;
};

/**
 * Redeems a single-use eGovPH exchange_code for an eBilihan session. The code arrives
 * either from the Login as eGov widget's onSuccess, or from eGovPH opening our own SSO
 * base URL with ?exchange_code=... appended. The backend does the two-call exchange
 * (POST /api/token then POST /api/partner/sso_authentication) — the secret never
 * reaches this app.
 */
export async function ssoLogin(exchangeCode: string) {
  const { data } = await api.post<SsoSession>("/auth/sso/login", { exchangeCode });
  return data;
}

/** The two public values the Login as eGov widget needs (partner_code + gateway host). */
export async function getSsoWidgetConfig() {
  const { data } = await api.get<{ partnerCode: string; host: string; partnerName?: string }>(
    "/auth/sso/widget-config",
  );
  return data;
}

/** Free probe (eGov SSO check_access) — tells us up front if our partner code is live. */
export async function getSsoHealth() {
  const { data } = await api.get<{ ok: boolean; reason?: string }>("/auth/sso/health");
  return data;
}

/** Verifies the stored session is still valid against the backend — see authStore.hydrate(). */
export async function getMe() {
  const { data } = await api.get<{ owner: StoreOwner; needsOnboarding: boolean }>("/auth/me");
  return data;
}

/** Completes first-time setup with the two things eGovPH does not provide. */
export async function completeOnboarding(storeName: string, location: StoreLocation) {
  const { data } = await api.post<{ owner: StoreOwner; needsOnboarding: boolean }>("/auth/onboarding", {
    storeName,
    location,
  });
  return data;
}
