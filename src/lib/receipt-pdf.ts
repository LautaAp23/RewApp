import { jsPDF } from "jspdf";
import type { ReceiptDocument } from "./receipt-document";

/** Produces a standalone document so recipients do not need access to the owner's account. */
export function receiptPdf(data: ReceiptDocument) {
  const pdf = new jsPDF({ format: "a5", unit: "mm", compress: true });
  pdf.setProperties({ title: data.title, subject: data.reference, author: "RewApp", creator: "RewApp" });
  let y = 20;
  const margin = 16;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  function text(value: string, size: number, bold = false, centered = false) {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(value.replace(/\u2212/g, "-").replace(/\u202f|\u00a0/g, " "), width) as string[];
    const height = lines.length * size * .4;
    if (y + height > 192) { pdf.addPage(); y = 20; }
    pdf.text(lines, centered ? 74 : margin, y, centered ? { align: "center" } : {});
    y += height + 4;
  }
  pdf.setTextColor(75, 50, 155);
  text("RewApp", 20, true, true);
  pdf.setTextColor(35, 35, 45);
  text(data.title, 13, true, true);
  text(data.confirmed, 10, false, true);
  y += 3;
  text(data.amount, 25, true, true);
  text(data.counterpart, 12, true, true);
  y += 5;
  for (const row of data.rows) { text(row.label, 9); text(row.value, 11, true); }
  y += 3;
  text(data.referenceLabel, 9); text(data.reference, 10);
  text(data.operationLabel, 9); text(data.operation, 8);
  text(data.timezone, 8);
  return new File([pdf.output("arraybuffer")], data.filename, { type: "application/pdf" });
}

export function downloadReceipt(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
