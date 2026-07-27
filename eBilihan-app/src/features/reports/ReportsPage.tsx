import { useState } from "react";
import { AlertOctagon, CheckCircle2, Send, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { LocationPicker } from "@/components/shared/LocationPicker";
import { submitComplaint } from "@/api/reports";
import { useAuthStore } from "@/store/authStore";
import type { StoreLocation } from "@/types";

/**
 * Category slugs are a best guess: eReport's own "Report Type List" dataset endpoint
 * (which enumerates the real accepted `report_type` values) was named in the reference
 * screenshots' sidebar but its request/response shape was never captured, so this isn't
 * grounded the way the rest of the eReport integration is. Only "crime" is directly
 * confirmed from the Submit Complaint example. If eReport rejects a category here,
 * that 502 will surface the real upstream validation message — see lib/apiError.ts.
 */
const CATEGORIES = [
  { value: "crime", label: "Crime / theft" },
  { value: "scam", label: "Fake GCash / payment scam" },
  { value: "fraud", label: "Supplier or identity fraud" },
  { value: "extortion", label: "Extortion / threats" },
  { value: "other", label: "Other" },
];

/** §6 — eReport ticketing. UI structure ported from the ebilihan-hackathon prototype's ReportPage. */
export function ReportsPage() {
  const owner = useAuthStore((s) => s.owner);
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<StoreLocation | null>(null);
  const [caseNumber, setCaseNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (!owner || !category || description.trim().length < 20 || !location) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const [firstName, ...rest] = owner.fullName.split(" ");
      const result = await submitComplaint({
        mobile: owner.mobile,
        firstName,
        lastName: rest.join(" ") || firstName,
        gender: "Unspecified",
        complainantEmail: owner.email,
        reportType: category,
        subject: subject || CATEGORIES.find((c) => c.value === category)?.label || category,
        message: description,
        regionCode: location.regionCode,
        provinceCode: location.provinceCode,
        municipalityCode: location.cityCode,
        barangayCode: location.barangayCode,
      });
      setCaseNumber(result.case_number);
      setCategory("");
      setSubject("");
      setDescription("");
      setLocation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit report");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (caseNumber) {
    return (
      <div className="flex flex-col items-center gap-5 p-4 py-16 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-red-light">
          <CheckCircle2 className="h-10 w-10 text-brand-red" />
        </div>
        <div>
          <h2 className="text-xl font-black text-brand-ink">Report Submitted</h2>
          <p className="mt-1 px-6 text-sm text-brand-ink/60">Safely forwarded to the authorities via the eReport API.</p>
          <p className="mt-4 rounded-lg bg-brand-surface p-2 font-mono text-xs">Case #: {caseNumber}</p>
        </div>
        <Button onClick={() => setCaseNumber(null)}>File Another Report</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 pb-6">
      <div>
        <h1 className="text-lg font-black text-brand-ink">Report an Incident</h1>
        <p className="text-xs text-brand-ink/50">Official gateway to authorities via eReport</p>
      </div>

      <Card className="border-brand-red-light bg-brand-red-light">
        <CardContent className="flex items-start gap-3 pt-4">
          <ShieldAlert className="h-6 w-6 shrink-0 text-brand-red" />
          <div>
            <p className="text-sm font-black text-brand-red">For serious incidents only</p>
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
              className="flex h-11 w-full rounded-lg border border-brand-ink/20 bg-white px-3 py-2 text-sm text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
            >
              <option value="" disabled>
                Select a category...
              </option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

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
            <LocationPicker value={location} onChange={setLocation} />
          </div>
        </CardContent>
      </Card>

      {error && <Badge variant="danger">{error}</Badge>}

      <Button
        size="lg"
        variant="destructive"
        onClick={handleSubmit}
        disabled={!category || description.trim().length < 20 || !location || isSubmitting}
      >
        <Send className="h-4 w-4" /> {isSubmitting ? "Submitting..." : "Submit to eReport"}
      </Button>
    </div>
  );
}
