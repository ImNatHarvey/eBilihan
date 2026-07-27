import { api } from "./client";
import type { EgovphProfile, StoreLocation, StoreOwner } from "@/types";

export async function ssoLogin(exchangeCode: string) {
  const { data } = await api.post<{ token: string; owner: StoreOwner }>("/auth/sso/login", { exchangeCode });
  return data;
}

/**
 * Mobile-number + eMessage OTP login — the working sign-in path while
 * VITE_EGOVPH_AUTHORIZE_URL is unset (see CLAUDE.md). Only works for a mobile number
 * already linked to a store via registerConfirm.
 */
export async function loginOtpStart(mobile: string) {
  const { data } = await api.post<{ message: string }>("/auth/login/otp/start", { mobile });
  return data;
}

export async function loginOtpConfirm(mobile: string, otp: string) {
  const { data } = await api.post<{ token: string; owner: StoreOwner }>("/auth/login/otp/confirm", { mobile, otp });
  return data;
}

/** Verifies the stored session is still valid against the backend — see authStore.hydrate(). */
export async function getMe() {
  const { data } = await api.get<{ owner: StoreOwner }>("/auth/me");
  return data.owner;
}

/** Stands in for a real eGovPH SSO profile fetch — see CLAUDE.md and server/src/routes/auth.ts. */
export async function fetchEgovphDemoProfile() {
  const { data } = await api.get<{ profile: EgovphProfile }>("/auth/egovph/demo-profile");
  return data.profile;
}

export async function registerStart(profile: EgovphProfile, storeName: string, location: StoreLocation) {
  const { data } = await api.post<{
    message: string;
    pendingRegistration: { profile: EgovphProfile; storeName: string; location: StoreLocation };
  }>("/auth/register/start", { profile, storeName, location });
  return data;
}

export async function registerConfirm(profile: EgovphProfile, storeName: string, location: StoreLocation, otp: string) {
  const { data } = await api.post<{ token: string; owner: StoreOwner }>("/auth/register/confirm", {
    profile,
    storeName,
    location,
    otp,
  });
  return data;
}
