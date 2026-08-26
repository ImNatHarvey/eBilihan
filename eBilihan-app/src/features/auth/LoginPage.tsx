import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Fingerprint, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSsoWidgetConfig, ssoLogin } from "@/api/auth";
import { renderEgovLogin } from "@/lib/egovLoginWidget";
import { useAuthStore } from "@/store/authStore";
import { getApiErrorMessage } from "@/lib/apiError";
import logo from "@/assets/eBilihan-Logo.png";

/**
 * The only sign-in surface eBilihan has, and deliberately the whole of it.
 *
 * eGovPH's partner requirements are explicit that an integrated service must not run its
 * own login, registration, or profile/password screens — sessions and profile data are
 * eGovPH's. So there is no mobile-number field, no OTP boxes, and no "register" tab here
 * any more: the citizen authenticates inside eGovPH's own widget (mobile/email → OTP →
 * eGov PIN), which hands back a single-use `exchange_code`. Our backend redeems it.
 *
 * The other way in is eGovPH launching us directly at /egovph/sso?exchange_code=... —
 * see SsoCallbackPage. Both converge on the same POST /auth/sso/login.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const mountRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function mountWidget() {
      try {
        const { partnerCode, host, partnerName } = await getSsoWidgetConfig();
        if (cancelled) return;
        if (!partnerCode || !host) {
          setError("eGovPH sign-in isn't configured on the server yet.");
          return;
        }

        await renderEgovLogin({
          target: "#egov-login",
          partnerCode,
          host,
          partnerName: partnerName ?? "eBilihan",
          onSuccess: async ({ exchangeCode }) => {
            setError(null);
            setIsSigningIn(true);
            try {
              // Single-use and short-lived — redeem it immediately.
              const { token, owner, needsOnboarding } = await ssoLogin(exchangeCode);
              await login(token, owner, needsOnboarding);
              navigate(needsOnboarding ? "/onboarding" : "/", { replace: true });
            } catch (err) {
              setError(getApiErrorMessage(err, "Could not complete eGovPH sign-in"));
            } finally {
              setIsSigningIn(false);
            }
          },
          onError: (err) => {
            setError(getApiErrorMessage(err, "eGovPH sign-in was cancelled or failed"));
          },
        });
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err, "Could not load eGovPH sign-in"));
      } finally {
        if (!cancelled) setIsPreparing(false);
      }
    }

    mountWidget();
    return () => {
      cancelled = true;
    };
  }, [login, navigate]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-brand-surface p-6">
      <img src={logo} alt="eBilihan" className="h-16" />
      <p className="-mt-4 text-sm text-brand-ink/60">Where Every Sari-Sari Store Grows Smarter</p>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Sign in with the eGovPH account you already use for other government services.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isSigningIn ? (
            <Button size="lg" disabled>
              <Loader2 className="animate-spin" /> Signing you in...
            </Button>
          ) : (
            <>
              {isPreparing && (
                <Button size="lg" disabled>
                  <Loader2 className="animate-spin" /> Loading eGovPH sign-in...
                </Button>
              )}
              {/*
                eGovPH's own widget renders here — mobile/email, OTP, then eGov PIN.
                `flex justify-center` centers whatever it draws inside OUR container; the
                widget's own markup and styling are left alone. It ships with no documented
                theme option, so it renders in eGovPH's styling rather than ours — see the
                README. Don't override its internals: the script URL is version-pinned and
                CSS hacks against it would break on their next release.
              */}
              <div id="egov-login" ref={mountRef} className="flex justify-center" />
            </>
          )}

          {error && <Badge variant="danger">{error}</Badge>}

          <p className="flex items-center gap-2 text-xs text-brand-ink/50">
            <Fingerprint className="h-4 w-4 shrink-0" />
            Your name, address and contact details stay managed in eGovPH.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
