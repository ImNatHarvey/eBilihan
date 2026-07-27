import { api } from "./client";
import type { Loan } from "@/types";

export type BorrowerVerificationResult = {
  matched: boolean;
  profile?: {
    code: string;
    full_name: string;
    first_name: string;
    last_name: string;
    face_url: string;
  };
};

export async function verifyBorrower(qrValue: string, faceLivenessSessionId: string) {
  const { data } = await api.post<BorrowerVerificationResult>("/loans/verify-borrower", { qrValue, faceLivenessSessionId });
  return data;
}

export async function listLoans() {
  const { data } = await api.get<{ data: Loan[] }>("/loans");
  return data.data;
}

export async function createLoan(input: {
  borrowerEgovphUniqid: string;
  borrowerName: string;
  borrowerPhilsysNumber: string;
  borrowerMobile?: string;
  principal: number;
}) {
  const { data } = await api.post<{ data: Loan }>("/loans", input);
  return data.data;
}

export async function updateLoan(id: string, input: Partial<Loan>) {
  const { data } = await api.put<{ data: Loan }>(`/loans/${id}`, input);
  return data.data;
}

export async function deleteLoan(id: string) {
  await api.delete(`/loans/${id}`);
}
