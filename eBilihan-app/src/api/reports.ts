import { api } from "./client";
import type { PsgcItem } from "@/types";

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

export async function requestReportOtp(email: string) {
  const { data } = await api.post("/reports/otp/request", { email });
  return data;
}

export async function confirmReportOtp(email: string, otp: string) {
  const { data } = await api.post("/reports/otp/confirm", { email, otp });
  return data;
}

export type SubmitComplaintInput = {
  mobile: string;
  firstName: string;
  lastName: string;
  gender: string;
  complainantEmail: string;
  reportType: string;
  subject: string;
  message: string;
  evidences?: string[];
  regionCode: string;
  provinceCode: string;
  municipalityCode: string;
  barangayCode: string;
};

export async function submitComplaint(input: SubmitComplaintInput) {
  const { data } = await api.post<{ code: number; message: string; case_number: string }>("/reports", input);
  return data;
}

export async function listReports(q?: string, page = 1) {
  const { data } = await api.get("/reports", { params: { q, page } });
  return data;
}

export async function viewReportByCaseNumber(caseNumber: string) {
  const { data } = await api.get(`/reports/${caseNumber}`);
  return data;
}
