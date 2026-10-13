import type { ReceiptView } from "./api/receipt";
import { formatMoney, formatUsdr } from "./money";

export type ReceiptDocument = {
  title: string;
  confirmed: string;
  amount: string;
  counterpart: string;
  rows: { label: string; value: string }[];
  referenceLabel: string;
  reference: string;
  operationLabel: string;
  operation: string;
  timezone: string;
  filename: string;
};
type ReceiptTextKey = "date" | "merchant" | "destination" | "method" | "topupMethod" | "balance" | "reward" | "sender" | "senderAccount" | "recipientAccount" |
  "reference" | "operation" | "timezone" | "confirmed" | `kindTitles.${ReceiptView["kind"]}`;

/** Deliberately excludes loyalty data from the screen, PDF and share payload. */
export function receiptDocument(receipt: ReceiptView, locale: string, t: (key: ReceiptTextKey) => string): ReceiptDocument {
  const rows = [
    { label: t("date"), value: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "America/Buenos_Aires" }).format(new Date(receipt.paidAt)) },
    { label: t(receipt.kind === "payment" ? "merchant" : "destination"), value: receipt.merchant },
    { label: t("method"), value: t(receipt.kind === "topup" ? "topupMethod" : "balance") },
  ];
  if (receipt.kind === "transfer") {
    if (receipt.sender) rows.push({ label: t("sender"), value: receipt.sender });
    if (receipt.senderAccount) rows.push({ label: t("senderAccount"), value: receipt.senderAccount });
    if (receipt.recipientAccount) rows.push({ label: t("recipientAccount"), value: receipt.recipientAccount });
  }
  if (BigInt(receipt.merchantReward) > 0n) rows.push({ label: t("reward"), value: formatUsdr(BigInt(receipt.merchantReward), "USD", { USD: "1" }, locale) });
  return {
    title: t(`kindTitles.${receipt.kind}`), confirmed: t("confirmed"),
    amount: formatMoney(Number(receipt.localAmount), receipt.localCurrency, locale), counterpart: receipt.merchant, rows,
    referenceLabel: t("reference"), reference: receipt.id, operationLabel: t("operation"), operation: receipt.txHash,
    timezone: t("timezone"), filename: `RewApp-${receipt.kind}-${receipt.id.replace(/[^a-zA-Z0-9_-]/g, "")}.pdf`,
  };
}
