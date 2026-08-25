import { create } from "zustand";
import { Preferences } from "@capacitor/preferences";
import { setSessionToken, clearSessionToken, SESSION_TOKEN_KEY } from "@/api/client";
import { getMe } from "@/api/auth";
import type { StoreOwner } from "@/types";

type AuthState = {
  owner: StoreOwner | null;
  /** True between a citizen's first SSO sign-in and completing the onboarding screen. */
  needsOnboarding: boolean;
  isHydrated: boolean;
  login: (token: string, owner: StoreOwner, needsOnboarding: boolean) => Promise<void>;
  setOwner: (owner: StoreOwner, needsOnboarding: boolean) => void;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  owner: null,
  needsOnboarding: false,
  isHydrated: false,

  login: async (token, owner, needsOnboarding) => {
    await setSessionToken(token);
    set({ owner, needsOnboarding });
  },

  setOwner: (owner, needsOnboarding) => set({ owner, needsOnboarding }),

  logout: async () => {
    await clearSessionToken();
    set({ owner: null, needsOnboarding: false });
  },

  /**
   * Re-verifies the stored session against the backend on every app boot, instead of
   * trusting a cached owner object. The backend's owner store is in-memory (see
   * server/src/store/db.ts) — a restart wipes it, so a token that still parses fine
   * client-side can point at an owner that's gone. GET /auth/me catches that
   * immediately (401), and the axios response interceptor (api/client.ts) clears the
   * stale token — so a backend restart reliably drops you back to the login screen
   * instead of leaving the app in a half-logged-in state.
   */
  hydrate: async () => {
    const { value: token } = await Preferences.get({ key: SESSION_TOKEN_KEY });
    if (!token) {
      set({ owner: null, needsOnboarding: false, isHydrated: true });
      return;
    }
    try {
      const { owner, needsOnboarding } = await getMe();
      set({ owner, needsOnboarding, isHydrated: true });
    } catch {
      set({ owner: null, needsOnboarding: false, isHydrated: true });
    }
  },
}));
