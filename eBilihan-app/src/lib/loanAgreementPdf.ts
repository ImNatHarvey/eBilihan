import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import type { Loan } from "@/types";

/**
 * Renders the loan's Terms of Payment / Agreement text into an off-screen, styled DOM
 * node, rasterizes it with html2canvas, and embeds the image in a jsPDF document.
 * (The POS receipt uses jsPDF's own text API directly instead — this richer
 * html2canvas path is reserved for the one document that benefits from letterhead-style
 * formatting. See src/lib/receipt.ts.)
 */
export async function buildLoanAgreementPdf(loan: Loan, storeName: string): Promise<jsPDF> {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "700px";
  container.style.padding = "32px";
  container.style.fontFamily = "system-ui, sans-serif";
  container.style.background = "#ffffff";
  container.style.color = "#2e353b";
  container.innerHTML = `
    <div style="text-align:center;margin-bottom:24px;">
      <h1 style="font-size:20px;margin:0;color:#0241e8;">${storeName}</h1>
      <p style="font-size:12px;color:#666;margin:4px 0 0;">Loan Agreement &amp; Terms of Payment</p>
    </div>
    <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:16px;">
      <tr><td style="padding:4px 0;color:#666;">Borrower</td><td style="padding:4px 0;font-weight:600;">${loan.borrowerName}</td></tr>
      <tr><td style="padding:4px 0;color:#666;">PhilSys Number</td><td style="padding:4px 0;">${loan.borrowerPhilsysNumber}</td></tr>
      <tr><td style="padding:4px 0;color:#666;">Principal</td><td style="padding:4px 0;font-weight:600;">PHP ${loan.principal.toFixed(2)}</td></tr>
      <tr><td style="padding:4px 0;color:#666;">Date Issued</td><td style="padding:4px 0;">${new Date(loan.createdAt).toLocaleDateString("en-PH")}</td></tr>
    </table>
    <pre style="white-space:pre-wrap;font-family:inherit;font-size:12px;line-height:1.6;border-top:1px solid #e5e4e7;padding-top:16px;">${loan.termsOfPaymentText}</pre>
    <div style="margin-top:48px;display:flex;justify-content:space-between;font-size:12px;">
      <div>_______________________<br/>Borrower Signature</div>
      <div>_______________________<br/>Store Owner Signature</div>
    </div>
  `;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, { scale: 2 });
    const doc = new jsPDF({ unit: "px", format: [canvas.width / 2, canvas.height / 2] });
    doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
    return doc;
  } finally {
    document.body.removeChild(container);
  }
}
