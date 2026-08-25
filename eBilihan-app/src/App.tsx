import { useEffect } from "react";
import type { ReactNode } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/features/auth/LoginPage";
import { SsoCallbackPage } from "@/features/auth/SsoCallbackPage";
import { OnboardingPage } from "@/features/auth/OnboardingPage";
import { HomePage } from "@/features/home/HomePage";
import { POSView } from "@/features/pos/POSView";
import { ProductsPage } from "@/features/products/ProductsPage";
import { WalletPage } from "@/features/wallet/WalletPage";
import { ReportsPage } from "@/features/reports/ReportsPage";
import { useAuthStore } from "@/store/authStore";

/**
 * Signed in, and past onboarding. A citizen who has authenticated with eGovPH but not
 * yet named their store is held at /onboarding — every other route would show them a
 * store that does not exist yet.
 */
function RequireAuth({ children }: { children: ReactNode }) {
  const { owner, needsOnboarding, isHydrated } = useAuthStore();
  if (!isHydrated) return null;
  if (!owner) return <Navigate to="/login" replace />;
  if (needsOnboarding) return <Navigate to="/onboarding" replace />;
  return children;
}

/** Signed in, but onboarding not yet done — the only state /onboarding is valid in. */
function RequireOnboarding({ children }: { children: ReactNode }) {
  const { owner, needsOnboarding, isHydrated } = useAuthStore();
  if (!isHydrated) return null;
  if (!owner) return <Navigate to="/login" replace />;
  if (!needsOnboarding) return <Navigate to="/" replace />;
  return children;
}

/**
 * eGovPH launches an integrated service by opening its SSO base URL with the
 * authentication parameter appended:
 *
 *     https://<our-base-url>/egovph/sso?exchange_code=<code>
 *
 * In a browser that is just a normal navigation and React Router handles it. Inside the
 * Capacitor shell the OS hands the URL to the app instead, as an `appUrlOpen` event —
 * so we translate it into the same in-app route. Without this, a native build would
 * receive the code and silently drop it.
 */
function useEgovphDeepLink() {
  const navigate = useNavigate();

  useEffect(() => {
    const listener = CapacitorApp.addListener("appUrlOpen", ({ url }: { url: string }) => {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return;
      }
      const exchangeCode = parsed.searchParams.get("exchange_code");
      if (!exchangeCode) return;

      // The widget/OTP screens may have been opened in the in-app browser; close it
      // before routing, or the app resumes underneath a still-open web view.
      Browser.close().catch(() => undefined);
      navigate(`/egovph/sso?exchange_code=${encodeURIComponent(exchangeCode)}`, { replace: true });
    });

    return () => {
      listener.then((handle: { remove: () => void }) => handle.remove()).catch(() => undefined);
    };
  }, [navigate]);
}

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  useEgovphDeepLink();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/egovph/sso" element={<SsoCallbackPage />} />
      <Route
        path="/onboarding"
        element={
          <RequireOnboarding>
            <OnboardingPage />
          </RequireOnboarding>
        }
      />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="order" element={<POSView />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="wallet" element={<WalletPage />} />
        <Route path="reports" element={<ReportsPage />} />
      </Route>
    </Routes>
  );
}
