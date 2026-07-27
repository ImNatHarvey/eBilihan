import { useState } from "react";
import { QrCode, ScanFace, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { getEverifyPubKey } from "@/api/verify";
import { verifyBorrower, createLoan, type BorrowerVerificationResult } from "@/api/loans";
import { startFaceLiveness } from "@/lib/everifyFaceLiveness";
import { buildLoanAgreementPdf } from "@/lib/loanAgreementPdf";
import { useAuthStore } from "@/store/authStore";

type Step = "idle" | "scanning-qr" | "capturing-face" | "verifying" | "verified" | "rejected" | "creating-loan" | "done";

/**
 * Loan Management (Pautang) borrower verification: scan the borrower's eGovPH QR,
 * capture a face liveness session via eVerify's Web SDK, and match both against
 * PhilSys before a loan can be created. Per the project brief's hard constraint,
 * only a "matched" borrower (eVerify code AAA001) may proceed to loan creation.
 */
export function LoanVerificationFlow() {
  const owner = useAuthStore((s) => s.owner);
  const { scanOnce } = useBarcodeScanner();
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BorrowerVerificationResult | null>(null);
  const [principal, setPrincipal] = useState("");
  const [borrowerMobile, setBorrowerMobile] = useState("");

  async function startVerification() {
    setError(null);
    setResult(null);
    try {
      setStep("scanning-qr");
      const qrValue = await scanOnce();
      if (!qrValue) {
        setStep("idle");
        return;
      }

      setStep("capturing-face");
      const pubKey = await getEverifyPubKey();
      const { sessionId } = await startFaceLiveness(pubKey);

      setStep("verifying");
      const verification = await verifyBorrower(qrValue, sessionId);
      setResult(verification);
      setStep(verification.matched ? "verified" : "rejected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setStep("idle");
    }
  }

  async function handleCreateLoan() {
    if (!result?.matched || !result.profile) return;
    setStep("creating-loan");
    try {
      const loan = await createLoan({
        borrowerEgovphUniqid: result.profile.code,
        borrowerName: result.profile.full_name,
        borrowerPhilsysNumber: result.profile.code,
        borrowerMobile: borrowerMobile || undefined,
        principal: Number(principal),
      });
      const doc = await buildLoanAgreementPdf(loan, owner?.storeName ?? "eBilihan Store");
      doc.save(`loan-agreement-${loan.id.slice(0, 8)}.pdf`);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create loan");
      setStep("verified");
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Verify Borrower</CardTitle>
          <CardDescription>
            Scan the borrower&apos;s eGovPH QR code, then capture a face liveness check to confirm identity before
            lending.
          </CardDescription>
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
              <ScanFace className="mr-1 h-3 w-3" /> Capturing face liveness...
            </Badge>
          )}
          {step === "verifying" && (
            <Badge variant="default" className="w-fit">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Matching against PhilSys...
            </Badge>
          )}
          {error && (
            <Badge variant="danger" className="w-fit">
              {error}
            </Badge>
          )}
        </CardContent>
      </Card>

      {step === "rejected" && (
        <Card>
          <CardContent className="flex items-center gap-2 pt-4 text-brand-red">
            <XCircle />
            <p className="text-sm">
              Face did not match this eGovPH ID, or the account isn&apos;t fully verified. This customer cannot be
              loaned to until they resolve their eGovPH verification.
            </p>
          </CardContent>
        </Card>
      )}

      {(step === "verified" || step === "creating-loan" || step === "done") && result?.profile && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-5 w-5" /> Identity Verified
            </CardTitle>
            <CardDescription>{result.profile.full_name}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {step !== "done" ? (
              <>
                <div>
                  <Label htmlFor="principal">Loan amount (PHP)</Label>
                  <Input id="principal" type="number" min="1" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="borrowerMobile">Borrower mobile (for SMS alerts, optional)</Label>
                  <Input id="borrowerMobile" placeholder="+639XXXXXXXXX" value={borrowerMobile} onChange={(e) => setBorrowerMobile(e.target.value)} />
                </div>
                <Button
                  size="lg"
                  onClick={handleCreateLoan}
                  disabled={!principal || Number(principal) <= 0 || step === "creating-loan"}
                >
                  {step === "creating-loan" ? "Creating Loan..." : "Create Loan & Generate Agreement"}
                </Button>
              </>
            ) : (
              <Badge variant="success" className="w-fit">
                Loan created and agreement PDF saved.
              </Badge>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
