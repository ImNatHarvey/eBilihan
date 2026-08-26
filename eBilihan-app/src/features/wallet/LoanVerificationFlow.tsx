import { useRef, useState } from "react";
import { QrCode, ScanFace, CheckCircle2, Loader2, RotateCcw, Keyboard, AlertTriangle, XCircle } from "lucide-react";
import { Browser } from "@capacitor/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { OtpInput } from "@/components/ui/otp-input";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { getEverifyPubKey } from "@/api/verify";
import { startFaceLiveness, LivenessIncompleteError } from "@/lib/everifyFaceLiveness";
import { createLivenessSession, getLivenessResult } from "@/api/liveness";
import {
  loanOtpStart,
  loanOtpConfirm,
  verifyBorrower,
  verifyBorrowerByDetails,
  type LoanInput,
} from "@/api/loans";
import { buildLoanAgreementPdf } from "@/lib/loanAgreementPdf";
import { useAuthStore } from "@/store/authStore";
import { ApiError, getApiErrorMessage } from "@/lib/apiError";

type Step = "idle" | "manual-entry" | "verifying" | "verified" | "owner-liveness" | "otp" | "creating-loan" | "done";

const OWNER_LIVENESS_TOKEN_KEY = "ebilihan_loan_owner_liveness_token";

/**
 * The three genuinely different ways verification can end without a loan. Keeping them
 * apart is not cosmetic: "incomplete" is a failure of ours, "rejected" is a finding about
 * a person, and showing the first as the second accuses a real customer of presenting a
 * false identity because a camera widget hung.
 */
type Failure =
  | { kind: "incomplete"; message: string }
  | { kind: "rejected"; message: string }
  | { kind: "unavailable"; message: string };

function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

/**
 * eVerify requires `YYYY-MM-DD` and a real past date. The 18+ floor below is **eBilihan's
 * own lending policy** — no eGov API imposes an age limit, and eVerify will happily match
 * a minor. We decline to record credit against one.
 */
function birthDateError(value: string): string | null {
  if (!value) return "Enter the borrower's birth date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Enter a valid date";
  if (date > new Date()) return "Birth date can't be in the future";
  const eighteenth = new Date(date.getFullYear() + 18, date.getMonth(), date.getDate());
  if (eighteenth > new Date()) return "Borrower must be at least 18 (eBilihan lending policy)";
  return null;
}

/**
 * Loan Management (Pautang) borrower verification.
 *
 * The gate is real and it is server-side. eVerify matches the borrower's National ID QR —
 * or their typed demographics, which is the flow eVerify's own docs lead with — against a
 * live face-liveness session. On a match the *server* keeps the verified identity and
 * hands back only an opaque `verificationId`; the loan is created from that record, so a
 * borrower's name can never be something this device supplied.
 *
 * Everything therefore fails closed. A liveness check that doesn't complete yields no
 * `verificationId`, and without one no client — honest or not — can create a loan.
 */
export function LoanVerificationFlow() {
  const owner = useAuthStore((s) => s.owner);
  const { scanOnce } = useBarcodeScanner();
  const abortRef = useRef<AbortController | null>(null);

  const [step, setStep] = useState<Step>("idle");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [verifiedName, setVerifiedName] = useState("");

  const [details, setDetails] = useState({ firstName: "", middleName: "", lastName: "", suffix: "", birthDate: "" });
  const [principal, setPrincipal] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [livenessToken, setLivenessToken] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  /** Classifies anything thrown during verification into exactly one of the three kinds. */
  function toFailure(err: unknown): Failure {
    if (err instanceof LivenessIncompleteError) {
      return { kind: "incomplete", message: err.message };
    }
    if (err instanceof ApiError && (err.kind === "network" || err.kind === "timeout" || err.status === 429 || (err.status ?? 0) >= 500)) {
      return { kind: "unavailable", message: err.message };
    }
    return { kind: "unavailable", message: getApiErrorMessage(err, "Verification couldn't be completed.") };
  }

  function resetVerification(back: Step) {
    setVerificationId(null);
    setVerifiedName("");
    setStatusNote(null);
    setStep(back);
  }

  async function captureLivenessSession(): Promise<string> {
    setStatusNote("Complete the face check in the window that opens...");
    const pubKey = await getEverifyPubKey();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { sessionId } = await startFaceLiveness(pubKey, controller.signal);
      setStatusNote("Matching against PhilSys...");
      return sessionId;
    } finally {
      abortRef.current = null;
    }
  }

  function applyVerdict(verdict: Awaited<ReturnType<typeof verifyBorrower>>, back: Step) {
    if (!verdict.matched) {
      // A real negative result about a real person — worded so it can't be mistaken for
      // "our camera didn't work".
      setFailure({ kind: "rejected", message: verdict.reason });
      resetVerification(back);
      return;
    }
    setVerificationId(verdict.verificationId);
    setVerifiedName(verdict.borrowerName);
    setStatusNote(null);
    setStep("verified");
  }

  async function startQrVerification() {
    setFailure(null);
    try {
      setStep("verifying");
      setStatusNote("Scan the borrower's National ID QR code...");
      const value = await scanOnce("qr");
      if (!value) {
        resetVerification("idle");
        return;
      }
      const sessionId = await captureLivenessSession();
      applyVerdict(await verifyBorrower(value, sessionId), "idle");
    } catch (err) {
      setFailure(toFailure(err));
      resetVerification("idle");
    }
  }

  async function startManualVerification() {
    const dateError = birthDateError(details.birthDate);
    if (!details.firstName.trim() || !details.lastName.trim() || dateError) {
      setFailure({ kind: "incomplete", message: dateError ?? "First and last name are required" });
      return;
    }
    setFailure(null);
    try {
      setStep("verifying");
      const sessionId = await captureLivenessSession();
      applyVerdict(
        await verifyBorrowerByDetails(
          {
            firstName: details.firstName.trim(),
            middleName: details.middleName.trim() || undefined,
            lastName: details.lastName.trim(),
            suffix: details.suffix.trim() || undefined,
            birthDate: details.birthDate,
          },
          sessionId,
        ),
        "manual-entry",
      );
    } catch (err) {
      setFailure(toFailure(err));
      resetVerification("manual-entry");
    }
  }

  /** Owner's own face check, required by the server for high-value loans. */
  async function startOwnerLiveness() {
    setFailure(null);
    setIsBusy(true);
    try {
      const { token, url } = await createLivenessSession(`${window.location.origin}/wallet?ownerLiveness=done`);
      sessionStorage.setItem(OWNER_LIVENESS_TOKEN_KEY, token);
      await Browser.open({ url });
      // The hosted check runs in a browser view; the owner returns here and confirms.
      setStep("owner-liveness");
    } catch (err) {
      setFailure(toFailure(err));
    } finally {
      setIsBusy(false);
    }
  }

  async function confirmOwnerLiveness() {
    const token = sessionStorage.getItem(OWNER_LIVENESS_TOKEN_KEY);
    if (!token) {
      setFailure({ kind: "incomplete", message: "That face check didn't finish. Please try again." });
      return;
    }
    setIsBusy(true);
    try {
      const verdict = await getLivenessResult(token);
      sessionStorage.removeItem(OWNER_LIVENESS_TOKEN_KEY);
      if (!verdict.passed || !verdict.livenessToken) {
        setFailure({ kind: "incomplete", message: verdict.reason ?? "The face check didn't pass. Please try again." });
        setStep("verified");
        return;
      }
      setLivenessToken(verdict.livenessToken);
      setFailure(null);
      await sendOtp(verdict.livenessToken);
    } catch (err) {
      setFailure(toFailure(err));
    } finally {
      setIsBusy(false);
    }
  }

  async function sendOtp(tokenOverride?: string) {
    setFailure(null);
    setIsBusy(true);
    try {
      await loanOtpStart();
      if (tokenOverride) setLivenessToken(tokenOverride);
      setStep("otp");
    } catch (err) {
      setFailure(toFailure(err));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleConfirmOtp() {
    if (!verificationId) return;
    setFailure(null);
    setStep("creating-loan");
    try {
      const input: LoanInput = {
        verificationId,
        principal: Number(principal),
        dueDate: new Date(dueDate).toISOString(),
        livenessToken: livenessToken ?? undefined,
      };
      const loan = await loanOtpConfirm(otp, input);
      const doc = await buildLoanAgreementPdf(loan, owner?.storeName ?? "eBilihan Store");
      doc.save(`loan-agreement-${loan.id.slice(0, 8)}.pdf`);
      setStep("done");
    } catch (err) {
      // The server tells us when a high-value loan needs the owner's own face check.
      if (err instanceof ApiError && err.needsOwnerLiveness) {
        setFailure({ kind: "incomplete", message: err.message });
        setStep("verified");
        return;
      }
      setFailure(toFailure(err));
      setStep("otp");
    }
  }

  function cancelVerification() {
    abortRef.current?.abort();
    setFailure({ kind: "incomplete", message: "The face check was cancelled." });
    resetVerification("idle");
  }

  function startOver() {
    setFailure(null);
    setDetails({ firstName: "", middleName: "", lastName: "", suffix: "", birthDate: "" });
    setPrincipal("");
    setDueDate(defaultDueDate());
    setLivenessToken(null);
    setOtp("");
    resetVerification("idle");
  }

  const isVerified = step === "verified" || step === "owner-liveness" || step === "otp" || step === "creating-loan" || step === "done";

  /** Rejection is a finding about a person; the other two are our problem. */
  const failureBadge = failure && (
    <Badge variant={failure.kind === "rejected" ? "danger" : "default"} className="w-fit">
      {failure.kind === "rejected" ? (
        <XCircle className="mr-1 h-3 w-3" />
      ) : (
        <AlertTriangle className="mr-1 h-3 w-3" />
      )}
      {failure.message}
    </Badge>
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Verify Borrower</CardTitle>
          <CardDescription>
            Scan the borrower&apos;s National ID QR code, then complete a face check. eVerify confirms the match.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {step === "idle" && (
            <>
              <Button size="lg" onClick={startQrVerification}>
                <QrCode /> Start Verification
              </Button>
              {/*
                `buttonVariants` sets `whitespace-nowrap` for the usual single-word button,
                which forced this sentence onto one line and ran it off the right edge of
                the dialog on a phone. Overridden here only — the shared variant is left
                alone. `h-auto` because the default size pins a fixed height that wrapped
                text would otherwise spill out of.
              */}
              <Button
                variant="link"
                className="h-auto whitespace-normal py-2 text-center leading-snug"
                onClick={() => { setStep("manual-entry"); setFailure(null); }}
              >
                <Keyboard className="h-4 w-4" /> QR code won&apos;t scan? Enter details instead
              </Button>
            </>
          )}

          {step === "manual-entry" && (
            <>
              <div>
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" value={details.firstName} onChange={(e) => setDetails({ ...details, firstName: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="middleName">Middle name (optional)</Label>
                <Input id="middleName" value={details.middleName} onChange={(e) => setDetails({ ...details, middleName: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" value={details.lastName} onChange={(e) => setDetails({ ...details, lastName: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="suffix">Suffix (optional)</Label>
                <Input id="suffix" value={details.suffix} onChange={(e) => setDetails({ ...details, suffix: e.target.value })} placeholder="JR" />
              </div>
              <div>
                <Label htmlFor="birthDate">Birth date</Label>
                <Input id="birthDate" type="date" value={details.birthDate} onChange={(e) => setDetails({ ...details, birthDate: e.target.value })} />
              </div>
              <Button size="lg" onClick={startManualVerification}>
                <ScanFace /> Continue to Face Check
              </Button>
              <Button variant="link" onClick={() => { setStep("idle"); setFailure(null); }}>
                Back to QR scan
              </Button>
            </>
          )}

          {step === "verifying" && (
            <>
              <Badge variant="default" className="w-fit">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" /> {statusNote ?? "Verifying..."}
              </Badge>
              {/* Without this, a face check that never posts back leaves a dead spinner. */}
              <Button variant="outline" onClick={cancelVerification}>
                Cancel
              </Button>
            </>
          )}

          {failureBadge}
        </CardContent>
      </Card>

      {isVerified && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-5 w-5" /> Identity Verified
            </CardTitle>
            <CardDescription>{verifiedName}</CardDescription>
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
                {failure?.kind === "incomplete" && !livenessToken ? (
                  <Button size="lg" onClick={startOwnerLiveness} disabled={isBusy}>
                    {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanFace />} Verify it&apos;s you
                  </Button>
                ) : (
                  <Button size="lg" onClick={() => sendOtp()} disabled={!principal || Number(principal) <= 0 || isBusy}>
                    {isBusy ? "Sending code..." : "Send OTP to Confirm"}
                  </Button>
                )}
              </>
            )}

            {step === "owner-liveness" && (
              <>
                <p className="text-sm text-brand-ink/60">
                  Finish the face check in the window that opened, then confirm here.
                </p>
                <Button size="lg" onClick={confirmOwnerLiveness} disabled={isBusy}>
                  {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 />}
                  {isBusy ? "Checking..." : "I've finished the face check"}
                </Button>
              </>
            )}

            {step === "otp" && (
              <>
                <Label>Enter the 6-digit code sent to your eGovPH mobile number</Label>
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

            {step !== "done" && failureBadge}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
