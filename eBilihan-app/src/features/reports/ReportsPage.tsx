import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, CheckCircle2, FileSearch, Loader2, Send, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { OtpInput } from "@/components/ui/otp-input";
import { ReportLocationPicker, type ReportLocation } from "./ReportLocationPicker";
import {
  submitComplaint,
  listReportTypes,
  requestReportOtp,
  confirmReportOtp,
  listReports,
  type ReportSummary,
} from "@/api/reports";
import { useAuthStore } from "@/store/authStore";
import { getApiErrorMessage } from "@/lib/apiError";

/** eReport requires a gender on every complaint; SSO supplies it unless the citizen withheld it. */
const GENDER_OPTIONS = ["Male", "Female"];

const SELECT_CLASS =
  "flex h-11 w-full rounded-lg border border-brand-ink/20 bg-white px-3 py-2 text-sm text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";

/** §6 — eReport ticketing. UI structure ported from the ebilihan-hackathon prototype's ReportPage. */
export function ReportsPage() {
  const owner = useAuthStore((s) => s.owner);
  const { data: categories = [] } = useQuery({ queryKey: ["ereport-report-types"], queryFn: listReportTypes });

  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<ReportLocation | null>(null);
  // eGovPH normalizes gender as "male"/"female"; eReport's own examples are capitalized.
  const ssoGender = owner?.gender ? owner.gender.charAt(0).toUpperCase() + owner.gender.slice(1).toLowerCase() : "";
  const [gender, setGender] = useState(GENDER_OPTIONS.includes(ssoGender) ? ssoGender : "");

  const [caseNumber, setCaseNumber] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- "My Reports": eReport's read side, unlocked by its own email OTP ---
  const [lookupStep, setLookupStep] = useState<"idle" | "otp" | "unlocked">("idle");
  const [lookupEmail, setLookupEmail] = useState(owner?.email ?? "");
  const [lookupOtp, setLookupOtp] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [reports, setReports] = useState<ReportSummary[]>([]);

  const canSubmit =
    !!owner && !!category && !!gender && description.trim().length >= 20 && !!location && !isSubmitting;

  async function handleSubmit() {
    if (!owner || !location) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      // Who is filing this comes from the session, server-side — this device only says
      // what happened and where.
      const result = await submitComplaint({
        gender,
        reportType: category,
        subject: subject || categories.find((c) => c.code === category)?.name || category,
        message: description,
        regionCode: location.regionCode,
        provinceCode: location.provinceCode,
        municipalityCode: location.municipalityCode,
        barangayCode: location.barangayCode,
      });
      setCaseNumber(result.case_number);
      setCategory("");
      setSubject("");
      setDescription("");
      setLocation(null);
    } catch (err) {
      // A case number is a promise that authorities received this. If eReport didn't
      // accept the filing, say so — inventing a local reference would leave someone
      // believing a serious incident had been reported when it hadn't.
      setSubmitError(getApiErrorMessage(err, "eReport couldn't accept this filing. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRequestLookupOtp() {
    setLookupError(null);
    setLookupBusy(true);
    try {
      await requestReportOtp(lookupEmail.trim());
      setLookupStep("otp");
    } catch (err) {
      setLookupError(getApiErrorMessage(err, "Could not send the verification code"));
    } finally {
      setLookupBusy(false);
    }
  }

  async function handleConfirmLookupOtp() {
    setLookupError(null);
    setLookupBusy(true);
    try {
      await confirmReportOtp(lookupEmail.trim(), lookupOtp);
      setReports(await listReports());
      setLookupStep("unlocked");
      setLookupOtp("");
    } catch (err) {
      setLookupError(getApiErrorMessage(err, "That code wasn't accepted"));
    } finally {
      setLookupBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 pb-6">
      <div>
        <h1 className="text-lg font-bold text-brand-ink">Report an Incident</h1>
        <p className="text-xs text-brand-ink/50">Official gateway to authorities via eReport</p>
      </div>

      <Card className="border-brand-red-light bg-brand-red-light">
        <CardContent className="flex items-start gap-3 pt-4">
          <ShieldAlert className="h-6 w-6 shrink-0 text-brand-red" />
          <div>
            <p className="text-sm font-bold text-brand-red">For serious incidents only</p>
            <p className="mt-1 text-xs text-brand-red/80">
              Fraud, theft, and security incidents only. <strong>Do not</strong> use this for a customer who hasn&apos;t
              paid a loan — use the Wallet &gt; Loans reminders for that instead.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-4">
          <div className="flex items-center gap-2">
            <AlertOctagon className="h-5 w-5 text-brand-red" />
            <h2 className="text-sm font-bold text-brand-ink">File an Incident</h2>
          </div>

          <div>
            <Label htmlFor="category">Category</Label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="" disabled>
                {categories.length === 0 ? "Loading categories..." : "Select a category..."}
              </option>
              {categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* eReport requires a gender. Shown only when eGovPH didn't give us one. */}
          {!GENDER_OPTIONS.includes(ssoGender) && (
            <div>
              <Label htmlFor="gender">Gender</Label>
              <select id="gender" value={gender} onChange={(e) => setGender(e.target.value)} className={SELECT_CLASS}>
                <option value="" disabled>
                  Select...
                </option>
                {GENDER_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <Label htmlFor="subject">Subject (optional)</Label>
            <input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Short summary"
              className="flex h-11 w-full rounded-lg border border-brand-ink/20 bg-white px-3 py-2 text-sm text-brand-ink placeholder:text-brand-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
            />
          </div>

          <div>
            <Label htmlFor="description">Incident Details</Label>
            <textarea
              id="description"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe exactly what happened — when, where, who was involved..."
              className="min-h-28 w-full rounded-lg border border-brand-ink/20 bg-white p-2 text-sm text-brand-ink placeholder:text-brand-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
            />
            <p className="mt-1 text-[10px] text-brand-ink/40">
              {description.length < 20 ? `Need at least 20 characters (${description.length}/20)` : `${description.length} characters`}
            </p>
          </div>

          <div>
            <Label>Location of Incident</Label>
            <ReportLocationPicker value={location} onChange={setLocation} />
          </div>
        </CardContent>
      </Card>

      {submitError && <Badge variant="danger">{submitError}</Badge>}

      <Button size="lg" variant="destructive" onClick={handleSubmit} disabled={!canSubmit}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {isSubmitting ? "Submitting..." : "Submit to eReport"}
      </Button>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-4">
          <div className="flex items-center gap-2">
            <FileSearch className="h-5 w-5 text-brand-blue" />
            <h2 className="text-sm font-bold text-brand-ink">My Reports</h2>
          </div>

          {lookupStep === "idle" && (
            <>
              <p className="text-xs text-brand-ink/50">
                eReport sends a one-time code to your email before showing the reports you&apos;ve filed.
              </p>
              <div>
                <Label htmlFor="lookupEmail">Email address</Label>
                <Input
                  id="lookupEmail"
                  type="email"
                  value={lookupEmail}
                  onChange={(e) => setLookupEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <Button
                variant="outline"
                onClick={handleRequestLookupOtp}
                disabled={!/^\S+@\S+\.\S+$/.test(lookupEmail.trim()) || lookupBusy}
              >
                {lookupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {lookupBusy ? "Sending..." : "Send verification code"}
              </Button>
            </>
          )}

          {lookupStep === "otp" && (
            <>
              <Label>Enter the 6-digit code emailed to {lookupEmail}</Label>
              <OtpInput value={lookupOtp} onChange={setLookupOtp} />
              <p className="text-[10px] text-brand-ink/40">The code expires in 5 minutes.</p>
              <Button onClick={handleConfirmLookupOtp} disabled={lookupOtp.length !== 6 || lookupBusy}>
                {lookupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {lookupBusy ? "Verifying..." : "View my reports"}
              </Button>
              <Button variant="link" onClick={() => { setLookupStep("idle"); setLookupError(null); }}>
                Back
              </Button>
            </>
          )}

          {lookupStep === "unlocked" &&
            (reports.length === 0 ? (
              <p className="text-xs text-brand-ink/50">No reports filed from this email yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {reports.map((report) => (
                  <li key={report.id} className="rounded-lg border border-brand-ink/10 p-3">
                    <p className="font-mono text-xs text-brand-ink/60">{report.caseNumber}</p>
                    <p className="text-sm font-medium text-brand-ink">{report.subject || report.reportTypeName}</p>
                    {report.status && (
                      <Badge variant="default" className="mt-1">
                        {report.status}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            ))}

          {lookupError && <Badge variant="danger">{lookupError}</Badge>}
        </CardContent>
      </Card>

      <Dialog open={caseNumber !== null} onOpenChange={(open) => !open && setCaseNumber(null)}>
        <DialogContent>
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-red-light">
              <CheckCircle2 className="h-8 w-8 text-brand-red" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-brand-ink">Report Submitted</h2>
              <p className="mt-1 text-sm text-brand-ink/60">
                Safely forwarded to the authorities via the eReport API.
              </p>
              <p className="mt-3 rounded-lg bg-brand-surface p-2 font-mono text-xs">Case #: {caseNumber}</p>
            </div>
            <Button className="w-full" onClick={() => setCaseNumber(null)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
