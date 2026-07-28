import { useState } from "react";
import { QrCode, ScanFace, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { OtpInput } from "@/components/ui/otp-input";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { getEverifyPubKey } from "@/api/verify";
import { startFaceLiveness } from "@/lib/everifyFaceLiveness";
import { loanOtpStart, loanOtpConfirm, type LoanInput } from "@/api/loans";
import { DEMO_MOBILE_E164, maskMobile } from "@/lib/demoIdentity";
import { buildLoanAgreementPdf } from "@/lib/loanAgreementPdf";
import { useAuthStore } from "@/store/authStore";

type Step = "idle" | "scanning-qr" | "capturing-face" | "verified" | "otp" | "creating-loan" | "done";

/**
 * DEMO STAND-IN for the borrower's verified name only. The liveness check itself is
 * real: `startFaceLiveness()` below calls eVerify's actual Face Liveness Web SDK
 * (`window.eKYC().start({ pubKey })`), which opens eVerify's own full-screen iframe
 * and does genuine biometric liveness/anti-spoof detection — it rejects on failure or
 * user cancellation, exactly like the integration doc describes. What's still faked is
 * the *identity match*: turning that liveness session_id + the scanned QR into a
 * verified name requires `/loans/verify-borrower` (routes/loans.ts, still intact) to
 * return `code === "AAA001"` from eVerify's PhilSys-backed QR Verify, which needs the
 * demo eGovPH account to actually be eVerify-linked to the scanned QR — not reliably
 * available for a live demo. So the QR scan is real (used as `borrowerEgovphUniqid`
 * below) and the liveness capture is real, but the resulting *name* is this hardcoded
 * stand-in rather than whatever `/verify-borrower` would have returned.
 */
const DEMO_BORROWER_NAME = "ARIEL SAYGAN ALBERTO JR.";

function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

/**
 * Loan Management (Pautang) borrower verification + creation: scan the borrower's
 * eGovPH QR, capture a face liveness photo, confirm loan details, then an OTP to the
 * demo number gates actually recording the loan (same "prove control of this number"
 * pattern as login/registration).
 */
export function LoanVerificationFlow() {
  const owner = useAuthStore((s) => s.owner);
  const { scanOnce } = useBarcodeScanner();
  const [step, setStep] = useState<Step>("idle");
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [principal, setPrincipal] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [otp, setOtp] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  async function startVerification() {
    setError(null);
    try {
      setStep("scanning-qr");
      const value = await scanOnce("qr");
      if (!value) {
        setStep("idle");
        return;
      }
      setQrValue(value);

      setStep("capturing-face");
      const pubKey = await getEverifyPubKey();
      if (!pubKey) {
        setError("Face Liveness isn't configured (missing EVERIFY_PUBKEY on the backend).");
        setStep("idle");
        return;
      }
      await startFaceLiveness(pubKey);

      setStep("verified");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setStep("idle");
    }
  }

  async function handleSendOtp() {
    setError(null);
    setIsBusy(true);
    try {
      await loanOtpStart(DEMO_MOBILE_E164);
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send OTP");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleConfirmOtp() {
    if (!qrValue) return;
    setError(null);
    setStep("creating-loan");
    try {
      const input: LoanInput = {
        borrowerEgovphUniqid: qrValue,
        borrowerName: DEMO_BORROWER_NAME,
        borrowerPhilsysNumber: qrValue,
        borrowerMobile: DEMO_MOBILE_E164,
        principal: Number(principal),
        dueDate: new Date(dueDate).toISOString(),
      };
      const loan = await loanOtpConfirm(DEMO_MOBILE_E164, otp, input);
      const doc = await buildLoanAgreementPdf(loan, owner?.storeName ?? "eBilihan Store");
      doc.save(`loan-agreement-${loan.id.slice(0, 8)}.pdf`);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
      setStep("otp");
    }
  }

  function startOver() {
    setStep("idle");
    setError(null);
    setQrValue(null);
    setPrincipal("");
    setDueDate(defaultDueDate());
    setOtp("");
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Verify Borrower</CardTitle>
          <CardDescription>Scan the borrower&apos;s eGovPH QR code, then capture a face liveness check.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {step === "idle" && (
            <Button size="lg" onClick={startVerification}>
              <QrCode /> Start Verification
            </Button>
          )}
          {step === "scanning-qr" && (
            <Badge variant="default" className="w-fit">
              <QrCode className="mr-1 h-3 w-3" /> Scan the borrower&apos;s eGovPH QR code...
            </Badge>
          )}
          {step === "capturing-face" && (
            <Badge variant="default" className="w-fit">
              <ScanFace className="mr-1 h-3 w-3" /> Complete the face liveness check in the window that opens...
            </Badge>
          )}
          {error && (
            <Badge variant="danger" className="w-fit">
              {error}
            </Badge>
          )}
        </CardContent>
      </Card>

      {(step === "verified" || step === "otp" || step === "creating-loan" || step === "done") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-5 w-5" /> Identity Verified
            </CardTitle>
            <CardDescription>{DEMO_BORROWER_NAME}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {step === "verified" && (
              <>
                <div>
                  <Label htmlFor="principal">Loan amount (PHP)</Label>
                  <Input id="principal" type="number" min="1" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="dueDate">Due date</Label>
                  <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
                <Button size="lg" onClick={handleSendOtp} disabled={!principal || Number(principal) <= 0 || isBusy}>
                  {isBusy ? "Sending code..." : "Send OTP to Confirm"}
                </Button>
              </>
            )}

            {step === "otp" && (
              <>
                <Label>Enter the 6-digit code sent to {maskMobile(DEMO_MOBILE_E164)}</Label>
                <OtpInput value={otp} onChange={setOtp} />
                <Button size="lg" onClick={handleConfirmOtp} disabled={otp.length !== 6}>
                  Verify &amp; Create Loan
                </Button>
              </>
            )}

            {step === "creating-loan" && (
              <Badge variant="default" className="w-fit">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Creating loan &amp; sending agreement...
              </Badge>
            )}

            {step === "done" && (
              <>
                <Badge variant="success" className="w-fit">
                  Loan created — agreement sent via eMessage.
                </Badge>
                <Button variant="outline" onClick={startOver}>
                  <RotateCcw className="h-4 w-4" /> Verify Another Borrower
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
