import axios from "axios";
import { Preferences } from "@capacitor/preferences";
import { toApiError } from "@/lib/apiError";

/**
 * The mobile app only ever talks to eBilihan's own backend (see /server). It never
 * holds an eGovPH partner_secret, eVerify client_secret, eGovPay merchant token, or
 * eReport access_code — those stay server-side. See CLAUDE.md > Security model.
 */
export const SESSION_TOKEN_KEY = "ebilihan_session_token";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000",
});

api.interceptors.request.use(async (requestConfig) => {
  const { value } = await Preferences.get({ key: SESSION_TOKEN_KEY });
  if (value) {
    requestConfig.headers.Authorization = `Bearer ${value}`;
  }
  return requestConfig;
});

// Normalizes every failure (axios network errors, our backend's error JSON) into an
// ApiError whose `.message` is already safe to show a store owner — see lib/apiError.ts.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Only auto-logout when a request that WAS carrying our session token got rejected
    // (e.g. the backend restarted and its in-memory owner list is gone — see
    // requireAuth.ts). Pre-session calls like POST /auth/sso/login carry no bearer
    // token, and a failure there (an expired exchange_code, say) belongs inline on the
    // sign-in screen rather than as a redirect back to the screen you are already on.
    const hadSessionToken = Boolean(
      axios.isAxiosError(error) && (error.config?.headers as Record<string, unknown> | undefined)?.Authorization,
    );
    if (axios.isAxiosError(error) && error.response?.status === 401 && hadSessionToken) {
      await clearSessionToken();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(toApiError(error));
  },
);

export async function setSessionToken(token: string) {
  await Preferences.set({ key: SESSION_TOKEN_KEY, value: token });
}

export async function clearSessionToken() {
  await Preferences.remove({ key: SESSION_TOKEN_KEY });
}
