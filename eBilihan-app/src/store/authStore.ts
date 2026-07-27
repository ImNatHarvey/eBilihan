import { create } from "zustand";
import { Preferences } from "@capacitor/preferences";
import { setSessionToken, clearSessionToken, SESSION_TOKEN_KEY } from "@/api/client";
import { getMe } from "@/api/auth";
import type { StoreOwner } from "@/types";

type AuthState = {
  owner: StoreOwner | null;
  isHydrated: boolean;
  login: (token: string, owner: StoreOwner) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  owner: null,
  isHydrated: false,

  login: async (token, owner) => {
    await setSessionToken(token);
    set({ owner });
  },

  logout: async () => {
    await clearSessionToken();
    set({ owner: null });
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
      set({ owner: null, isHydrated: true });
      return;
    }
    try {
      const owner = await getMe();
      set({ owner, isHydrated: true });
    } catch {
      set({ owner: null, isHydrated: true });
    }
  },
}));
