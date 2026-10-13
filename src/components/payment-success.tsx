"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { ReceiptKind } from "@/lib/api/receipt";
import { receiptHref } from "@/lib/api/receipt";
import { ReceiptLink } from "./receipt-overlay";
import { ReceiptContent } from "./receipt-content";
import { primaryButton, secondaryButton } from "./ui";

export function PaymentSuccess({ title, id, kind = "payment", children }: { title: string; id: string; kind?: ReceiptKind; children?: ReactNode }) {
  const t = useTranslations("pay");
  return <main className="flex flex-1 flex-col items-center justify-center gap-5 text-center" aria-live="polite">
    <div className="animate-pop flex h-24 w-24 items-center justify-center rounded-full bg-primary text-on-primary shadow-glow" aria-hidden>
      <svg className="h-12 w-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
    <h1 className="text-2xl font-bold">{title}</h1>
    {children}
    <ReceiptLink href={receiptHref(kind, id)} className={secondaryButton}>{t("viewReceipt")}</ReceiptLink>
    <div className="w-full"><ReceiptContent chargeId={id} kind={kind} shareOnly /></div>
    <Link href="/inicio" className={primaryButton}>{t("backHome")}</Link>
  </main>;
}
