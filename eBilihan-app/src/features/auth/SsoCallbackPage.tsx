import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ssoLogin } from "@/api/auth";
import { useAuthStore } from "@/store/authStore";
import { getApiErrorMessage } from "@/lib/apiError";
import logo from "@/assets/eBilihan-Logo.png";

/**
 * eGovPH's primary integration path: it opens our service directly with the
 * authentication parameter appended —
 *
 *     https://<our-base-url>/egovph/sso?exchange_code=<code>
 *
 * — and the citizen is already authenticated on arrival. There is nothing to ask them
 * here; we redeem the code and drop them into the app. This route is also what the
 * Capacitor deep-link listener in App.tsx navigates to when the native shell receives
 * the same URL.
 *
 * The code is single-use, so this must not run twice for one code: React 18's StrictMode
 * double-invokes effects in development, and a second redeem of a spent code comes back
 * 422. `redeemedRef` makes the attempt idempotent.
 */
export function SsoCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const redeemedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const exchangeCode = params.get("exchange_code") ?? params.get("exchangeCode");

  useEffect(() => {
    if (redeemedRef.current) return;
    redeemedRef.current = true;

    if (!exchangeCode) {
      setError("This eGovPH sign-in link is missing its exchange code.");
      return;
    }

    (async () => {
      try {
        const { token, owner, needsOnboarding } = await ssoLogin(exchangeCode);
        await login(token, owner, needsOnboarding);
        navigate(needsOnboarding ? "/onboarding" : "/", { replace: true });
      } catch (err) {
        setError(getApiErrorMessage(err, "Could not complete eGovPH sign-in"));
      }
    })();
  }, [exchangeCode, login, navigate]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-brand-surface p-6">
      <img src={logo} alt="eBilihan" className="h-16" />

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{error ? "Sign-in failed" : "Signing you in"}</CardTitle>
          <CardDescription>
            {error ? "eGovPH couldn't complete this sign-in." : "Confirming your eGovPH identity..."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error ? (
            <>
              <Badge variant="danger">{error}</Badge>
              <Button size="lg" onClick={() => navigate("/login", { replace: true })}>
                Try again
              </Button>
            </>
          ) : (
            <Button size="lg" disabled>
              <Loader2 className="animate-spin" /> Please wait...
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
