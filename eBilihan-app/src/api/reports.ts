import { api } from "./client";
import type { PsgcItem } from "@/types";

/**
 * Query options for eReport's reference lookups — report types and the
 * region/province/municipality/barangay cascade.
 *
 * **Every one of these costs a portal credit.** They are also reference data that changes
 * about once a year, so refetching them is pure waste. Spread these options into any
 * useQuery that calls an eReport dataset endpoint.
 *
 * This exists because of a real incident: with the global `staleTime` at 30s and
 * TanStack's default `refetchOnWindowFocus`, sitting on the Reports page and alt-tabbing
 * back re-fetched report types AND regions every time — roughly 2 credits per return to
 * the tab, unattended. On a deployed site that is ~2 credits per visitor per minute, which
 * would drain the account during judging.
 *
 * Fetch once per session, then never again.
 */
export const EGOV_REFERENCE_QUERY = {
  staleTime: Infinity,
  gcTime: Infinity,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchOnReconnect: false,
} as const;

/**
 * eReport's OWN region/province/municipality/barangay codes — NOT PSGC Cloud's (see
 * src/api/locations.ts / components/shared/LocationPicker.tsx, used elsewhere for
 * registration). submit_complaint rejects PSGC Cloud codes outright; confirmed live
 * against the real eReport API. Used by ReportsPage's own location picker only.
 */
export async function listReportRegions() {
  const { data } = await api.get<PsgcItem[]>("/reports/datasets/regions");
  return data;
}
export async function listReportProvinces(regionCode: string) {
  const { data } = await api.get<PsgcItem[]>("/reports/datasets/provinces", { params: { regionCode } });
  return data;
}
export async function listReportMunicipalities(provinceCode: string) {
  const { data } = await api.get<PsgcItem[]>("/reports/datasets/municipalities", { params: { provinceCode } });
  return data;
}
export async function listReportBarangays(municipalityCode: string) {
  const { data } = await api.get<PsgcItem[]>("/reports/datasets/barangays", { params: { municipalityCode } });
  return data;
}
/** Replaces the earlier best-guess category list — these are the 12 real accepted `report_type` codes. */
export async function listReportTypes() {
  const { data } = await api.get<PsgcItem[]>("/reports/datasets/report-types");
  return data;
}

/**
 * eReport's email OTP. This is a separate identity check from signing in — it unlocks a
 * `report_view_token`, which is the only credential that can read reports back. Filing a
 * complaint does not need it; looking one up afterwards does.
 */
export async function requestReportOtp(email: string) {
  const { data } = await api.post<{ code: number; already_verified: boolean; message: string }>(
    "/reports/otp/request",
    { email },
  );
  return data;
}

export async function confirmReportOtp(email: string, otp: string) {
  const { data } = await api.post<{ code: number; report_view_token: string; expires_at: string }>(
    "/reports/otp/confirm",
    { email, otp },
  );
  return data;
}

/**
 * What this device is allowed to say about an incident.
 *
 * The complainant's identity — name, mobile, email — is conspicuously absent: the server
 * reads it from the signed-in owner record, which is itself mirrored read-only from their
 * eGovPH profile. Sending it from here would mean an official complaint could be filed
 * under an invented identity using our eReport credential.
 *
 * `gender` is the one identity field that can be supplied, and only as a fallback: eReport
 * requires it and eGovPH omits it when the citizen didn't consent to share it. The server
 * prefers its own copy whenever it has one.
 */
export type SubmitComplaintInput = {
  gender?: string;
  reportType: string;
  subject: string;
  message: string;
  evidences?: string[];
  regionCode: string;
  provinceCode: string;
  municipalityCode: string;
  barangayCode: string;
  latitude?: string;
  longitude?: string;
};

export async function submitComplaint(input: SubmitComplaintInput) {
  const { data } = await api.post<{ code: number; message: string; case_number: string }>("/reports", input);
  return data;
}

/** One row of eReport's JSON:API report list, flattened to what the UI actually shows. */
export type ReportSummary = {
  id: string;
  caseNumber: string;
  subject: string;
  status: string;
  reportTypeName: string;
  createdAt: string;
};

type JsonApiReport = {
  id: string;
  attributes?: {
    case_number?: string;
    subject?: string;
    status?: string;
    created_at?: string;
    report_type?: { name?: string };
  };
};

function toReportSummary(item: JsonApiReport): ReportSummary {
  const a = item.attributes ?? {};
  return {
    id: item.id,
    caseNumber: a.case_number ?? "",
    subject: a.subject ?? "",
    status: a.status ?? "",
    reportTypeName: a.report_type?.name ?? "",
    createdAt: a.created_at ?? "",
  };
}

export async function listReports(q?: string, page = 1) {
  const { data } = await api.get<{ data?: JsonApiReport[] }>("/reports", { params: { q, page } });
  return (data.data ?? []).map(toReportSummary);
}

export async function viewReportByCaseNumber(caseNumber: string) {
  const { data } = await api.get<{ data?: JsonApiReport }>(`/reports/${caseNumber}`);
  return data.data ? toReportSummary(data.data) : null;
}
