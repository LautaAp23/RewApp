"use client";

import Link from "next/link";
import { ReceiptLink } from "@/components/receipt-overlay";
import { useTranslations } from "next-intl";
import { primaryButton, secondaryButton } from "@/components/ui";
import { receiptHref } from "@/lib/api/receipt";

/** Mounted only after the onramp API confirms a successful transaction. */
export function TopUpSuccess({ amount, receiptId }: { amount: string; receiptId?: string }) {
  const t = useTranslations("topUp");
  const tPay = useTranslations("pay");
  return (
    <main
      className="flex flex-1 flex-col items-center justify-center gap-6 text-center"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className="topup-celebration relative flex h-40 w-40 items-center justify-center"
        aria-hidden="true"
      >
        <span className="topup-success-ring absolute h-24 w-24 rounded-full border-2 border-success" />
        <span className="topup-success-ring topup-success-ring-delayed absolute h-24 w-24 rounded-full border-2 border-success" />
        <div className="topup-success-badge relative flex h-24 w-24 items-center justify-center rounded-full bg-success text-background">
          <svg
            className="h-12 w-12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5 12 4.5 4.5L19 7" />
          </svg>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t("done", { amount })}</h1>
        <p className="text-muted">{t("successHint")}</p>
      </div>
      {receiptId ? <ReceiptLink href={receiptHref("topup", receiptId)} className={`${secondaryButton} w-full`}>{tPay("viewReceipt")}</ReceiptLink> : null}
      <Link href="/inicio" className={`${primaryButton} w-full`}>
        {t("backHome")}
      </Link>
    </main>
  );
}
