import { api } from "./client";

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
