import { useState } from "react";
import { Browser } from "@capacitor/browser";
import { useNavigate } from "react-router-dom";
import { Fingerprint, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OtpInput } from "@/components/ui/otp-input";
import { LocationPicker } from "@/components/shared/LocationPicker";
import { registerStart, registerConfirm, loginOtpStart, loginOtpConfirm, fetchEgovphDemoProfile } from "@/api/auth";
import { useAuthStore } from "@/store/authStore";
import { DEMO_MOBILE_E164, maskMobile } from "@/lib/demoIdentity";
import logo from "@/assets/eBilihan-Logo.png";
import type { EgovphProfile, StoreLocation } from "@/types";

type LoginStep = "start" | "otp";
type RegisterStep = "start" | "details" | "otp";

/**
 * eGovPH SSO login/registration. The exact authorize/redirect URL that hands back an
 * exchange_code was never present in the reviewed reference docs (see CLAUDE.md), so
 * both "Login via eGovPH SSO" and "Continue with eGovPH" currently go through a demo
 * stand-in (GET /auth/egovph/demo-profile, mobile-number + eMessage OTP) instead of a
 * real SSO round-trip. The real-SSO code path (Browser.open) is left in place and takes
 * over automatically once VITE_EGOVPH_AUTHORIZE_URL is set.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [mode, setMode] = useState<"login" | "register">("login");

  // --- login (demo mobile number + eMessage OTP) ---
  const [loginStep, setLoginStep] = useState<LoginStep>("start");
  const [loginOtp, setLoginOtp] = useState("");

  // --- register (demo eGovPH profile fetch + Location + eMessage OTP) ---
  const [registerStep, setRegisterStep] = useState<RegisterStep>("start");
  const [profile, setProfile] = useState<EgovphProfile | null>(null);
  const [storeName, setStoreName] = useState("");
  const [location, setLocation] = useState<StoreLocation | null>(null);
  const [registerOtp, setRegisterOtp] = useState("");
  const [pendingRegistration, setPendingRegistration] = useState<Awaited<ReturnType<typeof registerStart>>["pendingRegistration"] | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingProfile, setIsFetchingProfile] = useState(false);

  async function handleLoginSubmit() {
    setError(null);
    setIsLoading(true);
    try {
      const authorizeUrl = import.meta.env.VITE_EGOVPH_AUTHORIZE_URL;
      if (authorizeUrl) {
        // Real eGovPH SSO redirect flow, once configured. Returning here still needs a
        // deep-link listener to capture exchange_code and call ssoLogin() — not built yet.
        await Browser.open({ url: authorizeUrl });
        return;
      }
      await loginOtpStart(DEMO_MOBILE_E164);
      setLoginStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send login code");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLoginOtpConfirm() {
    setError(null);
    setIsLoading(true);
    try {
      const { token, owner } = await loginOtpConfirm(DEMO_MOBILE_E164, loginOtp);
      await login(token, owner);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleContinueWithEgovph() {
    setError(null);
    setIsFetchingProfile(true);
    try {
      // Small artificial delay so "Fetching your eGovPH details..." reads as a real fetch.
      const [fetchedProfile] = await Promise.all([
        fetchEgovphDemoProfile(),
        new Promise((resolve) => setTimeout(resolve, 900)),
      ]);
      setProfile(fetchedProfile);
      setRegisterStep("details");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch eGovPH details");
    } finally {
      setIsFetchingProfile(false);
    }
  }

  async function handleCompleteAndSendOtp() {
    if (!profile || !storeName || !location) return;
    setError(null);
    setIsLoading(true);
    try {
      const { pendingRegistration: pending } = await registerStart(profile, storeName, location);
      setPendingRegistration(pending);
      setRegisterStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start registration");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegisterConfirm() {
    if (!pendingRegistration) return;
    setError(null);
    setIsLoading(true);
    try {
      const { token, owner } = await registerConfirm(
        pendingRegistration.profile,
        pendingRegistration.storeName,
        pendingRegistration.location,
        registerOtp,
      );
      await login(token, owner);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "OTP verification failed");
    } finally {
      setIsLoading(false);
    }
  }

  function switchMode() {
    setMode(mode === "login" ? "register" : "login");
    setError(null);
    setLoginStep("start");
    setRegisterStep("start");
    setProfile(null);
    setPendingRegistration(null);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-brand-surface p-6">
      <img src={logo} alt="eBilihan" className="h-16" />
      <p className="-mt-4 text-sm text-brand-ink/60">Where Every Sari-Sari Store Grows Smarter</p>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === "login" ? "Sign in" : "Register your store"}</CardTitle>
          <CardDescription>Sign in with the eGovPH account you already use for other government services.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {mode === "login" && loginStep === "start" && (
            <>
              <p className="text-sm text-brand-ink/60">
                We&apos;ll send a one-time code to your eGovPH-linked number ({maskMobile(DEMO_MOBILE_E164)}).
              </p>
              {error && <Badge variant="danger">{error}</Badge>}
              <Button size="lg" onClick={handleLoginSubmit} disabled={isLoading}>
                <Fingerprint /> Login via eGovPH SSO
              </Button>
            </>
          )}

          {mode === "login" && loginStep === "otp" && (
            <>
              <Label>Enter the 6-digit code sent to {maskMobile(DEMO_MOBILE_E164)}</Label>
              <OtpInput value={loginOtp} onChange={setLoginOtp} />
              {error && <Badge variant="danger">{error}</Badge>}
              <Button size="lg" onClick={handleLoginOtpConfirm} disabled={loginOtp.length !== 6 || isLoading}>
                Verify &amp; Sign In
              </Button>
              <Button variant="link" onClick={() => { setLoginStep("start"); setError(null); }}>
                Back
              </Button>
            </>
          )}

          {mode === "register" && registerStep === "start" && (
            <>
              {error && <Badge variant="danger">{error}</Badge>}
              <Button size="lg" onClick={handleContinueWithEgovph} disabled={isFetchingProfile}>
                {isFetchingProfile ? <Loader2 className="animate-spin" /> : <Fingerprint />}
                {isFetchingProfile ? "Fetching your eGovPH details..." : "Continue with eGovPH"}
              </Button>
            </>
          )}

          {mode === "register" && registerStep === "details" && profile && (
            <>
              <div className="flex items-center gap-2 rounded-lg bg-brand-gold-light px-3 py-2 text-green-700">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span className="text-sm font-medium">eGovPH Identity Verified</span>
              </div>

              <div>
                <Label>Verified Name</Label>
                <p className="rounded-lg border border-brand-ink/10 bg-brand-surface px-3 py-2 text-sm font-medium">
                  {profile.first_name} {profile.last_name}
                </p>
              </div>
              <div>
                <Label>Email Address</Label>
                <p className="rounded-lg border border-brand-ink/10 bg-brand-surface px-3 py-2 text-sm">{profile.email}</p>
              </div>

              <div>
                <Label htmlFor="storeName">Store Name</Label>
                <Input id="storeName" value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Aling Nena's Sari-Sari Store" />
              </div>

              <div>
                <Label>Location</Label>
                <LocationPicker value={location} onChange={setLocation} />
              </div>

              {error && <Badge variant="danger">{error}</Badge>}

              <Button size="lg" onClick={handleCompleteAndSendOtp} disabled={!storeName || !location || isLoading}>
                Complete &amp; Send OTP
              </Button>
            </>
          )}

          {mode === "register" && registerStep === "otp" && pendingRegistration && (
            <>
              <Label>Enter the 6-digit code sent to {maskMobile(pendingRegistration.profile.mobile)}</Label>
              <OtpInput value={registerOtp} onChange={setRegisterOtp} />
              {error && <Badge variant="danger">{error}</Badge>}
              <Button size="lg" onClick={handleRegisterConfirm} disabled={registerOtp.length !== 6 || isLoading}>
                Confirm OTP &amp; Create Store
              </Button>
            </>
          )}

          <Button variant="link" onClick={switchMode}>
            {mode === "login" ? "New store? Register here" : "Already registered? Sign in"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
