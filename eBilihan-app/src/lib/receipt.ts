import { jsPDF } from "jspdf";
import type { Order } from "@/types";

/** Renders a digital receipt for a paid order and returns it as a jsPDF instance. */
export function buildReceiptPdf(order: Order, storeName: string): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: [80, 150] }); // 80mm thermal-receipt width
  let y = 10;

  doc.setFontSize(12);
  doc.text(storeName, 40, y, { align: "center" });
  y += 6;
  doc.setFontSize(8);
  doc.text("Official Digital Receipt", 40, y, { align: "center" });
  y += 4;
  doc.text(new Date(order.createdAt).toLocaleString("en-PH"), 40, y, { align: "center" });
  y += 4;
  doc.text(`Order #${order.id.slice(0, 8).toUpperCase()}`, 40, y, { align: "center" });
  y += 6;

  doc.line(5, y, 75, y);
  y += 4;

  for (const item of order.items) {
    doc.text(`${item.name} x${item.quantity}`, 5, y);
    doc.text(`PHP ${(item.unitPrice * item.quantity).toFixed(2)}`, 75, y, { align: "right" });
    y += 5;
  }

  doc.line(5, y, 75, y);
  y += 5;
  doc.setFontSize(10);
  doc.text("TOTAL", 5, y);
  doc.text(`PHP ${order.total.toFixed(2)}`, 75, y, { align: "right" });
  y += 5;
  doc.setFontSize(8);
  doc.text(`Paid via ${order.paymentMethod.toUpperCase()}`, 5, y);
  y += 5;

  if (order.chainTxId) {
    doc.text(`eGovchain ref: ${order.chainTxId.slice(0, 16)}...`, 5, y);
    y += 4;
  }

  return doc;
}
