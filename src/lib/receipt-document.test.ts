import { describe, expect, it } from "vitest";
import { receiptDocument } from "./receipt-document";
import { receiptPdf } from "./receipt-pdf";
import type { ReceiptView } from "./api/receipt";

const receipt: ReceiptView & { customerPoints: string } = {
  kind: "payment", id: "receipt-one", merchant: "Café Demo", localAmount: "5000.00", localCurrency: "ARS",
  usdAmount: "5000000", paidAt: "2026-10-12T20:00:00.000Z", txHash: `0x${"11".repeat(32)}`,
  merchantReward: "500000", customerPoints: "123456789",
};

describe("shareable monetary receipts", () => {
  it("does not include loyalty data in the screen or PDF document", () => {
    const doc = receiptDocument(receipt, "es", (key) => key);
    expect(JSON.stringify(doc)).not.toContain("123456789");
    expect(JSON.stringify(doc)).not.toMatch(/points/i);
    expect(doc.reference).toBe(receipt.id);
    expect(doc.operation).toBe(receipt.txHash);
    expect(doc.rows.some((row) => row.label === "reward")).toBe(true);
  });
  it("generates a real, standalone PDF file for sharing", async () => {
    const file = receiptPdf(receiptDocument(receipt, "es", (key) => key));
    expect(file.type).toBe("application/pdf");
    expect(file.name).toBe("RewApp-payment-receipt-one.pdf");
    expect(new TextDecoder().decode((await file.arrayBuffer()).slice(0, 5))).toBe("%PDF-");
    expect(file.size).toBeGreaterThan(1000);
  });
  it("uses operation-specific titles, methods and filenames for top-ups", () => {
    const doc = receiptDocument({ ...receipt, kind: "topup", merchant: "RewApp", merchantReward: "0" }, "pt", (key) => key);
    expect(doc.title).toBe("kindTitles.topup");
    expect(doc.rows.some((row) => row.label === "destination" && row.value === "RewApp")).toBe(true);
    expect(doc.rows.some((row) => row.label === "method" && row.value === "topupMethod")).toBe(true);
    expect(doc.rows.some((row) => row.label === "reward")).toBe(false);
    expect(doc.filename).toContain("topup");
  });
});
