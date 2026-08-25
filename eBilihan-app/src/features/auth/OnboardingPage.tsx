import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LocationPicker } from "@/components/shared/LocationPicker";
import { completeOnboarding } from "@/api/auth";
import { useAuthStore } from "@/store/authStore";
import { getApiErrorMessage } from "@/lib/apiError";
import type { StoreLocation } from "@/types";

/**
 * First sign-in only, and deliberately minimal.
 *
 * eGovPH gives us the citizen's identity; it does not know their store's name or where it
 * trades, and those are the two things eBilihan cannot run without. eGovPH's own
 * integration logic sanctions exactly this — "guide them through onboarding if additional
 * info is needed" — but nothing more: every identity field below is read-only, because
 * profile changes belong in eGovPH.
 *
 * Note there is no face check here. An earlier version had one, which was theatre: eGovPH
 * had already established identity via OTP + PIN, and an optional check that gates nothing
 * adds no assurance. The owner's liveness check now lives where it actually protects
 * something — before issuing a high-value loan (see LoanVerificationFlow).
 */
export function OnboardingPage() {
  const navigate = useNavigate();
  const owner = useAuthStore((s) => s.owner);
  const setOwner = useAuthStore((s) => s.setOwner);

  const [storeName, setStoreName] = useState("");
  const [location, setLocation] = useState<StoreLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const trimmedName = storeName.trim();
  const isNameValid = trimmedName.length >= 2 && trimmedName.length <= 60;

  async function handleSave() {
    if (!isNameValid || !location) return;
    setError(null);
    setIsSaving(true);
    try {
      const { owner: updated, needsOnboarding } = await completeOnboarding(trimmedName, location);
      setOwner(updated, needsOnboarding);
      navigate("/", { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save your store details"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 bg-brand-surface p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5" /> eGovPH Identity Verified
          </CardTitle>
          <CardDescription>Set up your store to finish. This only happens once.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div>
            <Label>Verified Name</Label>
            <p className="rounded-lg border border-brand-ink/10 bg-brand-surface px-3 py-2 text-sm font-medium">
              {owner?.fullName || "—"}
            </p>
          </div>
          <div>
            <Label>Email Address</Label>
            <p className="rounded-lg border border-brand-ink/10 bg-brand-surface px-3 py-2 text-sm">
              {owner?.email || "—"}
            </p>
          </div>
          <div>
            <Label>Mobile Number</Label>
            <p className="rounded-lg border border-brand-ink/10 bg-brand-surface px-3 py-2 text-sm">
              {owner?.mobile || "—"}
            </p>
          </div>
          <p className="text-[10px] text-brand-ink/40">
            These come from your eGovPH account and can only be changed there.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Store</CardTitle>
          <CardDescription>Where you trade, so reports and receipts carry the right details.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div>
            <Label htmlFor="storeName">Store Name</Label>
            <Input
              id="storeName"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="Aling Nena's Sari-Sari Store"
            />
            {storeName.length > 0 && !isNameValid && (
              <p className="mt-1 text-[10px] text-brand-red">Use between 2 and 60 characters.</p>
            )}
          </div>

          <div>
            <Label>Location</Label>
            <LocationPicker value={location} onChange={setLocation} />
          </div>
        </CardContent>
      </Card>

      {error && <Badge variant="danger">{error}</Badge>}

      <Button size="lg" onClick={handleSave} disabled={!isNameValid || !location || isSaving}>
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isSaving ? "Saving..." : "Finish Setup"}
      </Button>
    </div>
  );
}
