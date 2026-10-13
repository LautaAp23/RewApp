"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { card, primaryButton, secondaryButton } from "@/components/ui";
import type { ChargeView } from "@/lib/api/charges";

export type IssuedCharge = { id: string; localAmount: string; expiresAt: string; qrDataUrl: string };

/**
 * The till screen after issuing: pending QR, confirming, confirmed or
 * expired. The PAID confirmation freezes until the cashier starts another
 * charge, and never shows raw addresses: without a payer name it falls back
 * to a generic localized label.
 */
export function ChargeStatusSection({
  issued,
  status,
  payerName,
  confirmedAt,
  registerName,
  amountText,
  locale,
  onAnother,
}: {
  issued: IssuedCharge;
  status: ChargeView["status"];
  payerName: string | null;
  confirmedAt: Date | null;
  registerName: string;
  amountText: string;
  locale: string;
  onAnother(): void;
}) {
  const t = useTranslations("business");
  const timeFormat = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });

  if (status === "PAID") {
    return (
      <section className={`${card} flex flex-col items-center gap-3 text-center`}>
        <span aria-hidden className="flex h-20 w-20 items-center justify-center rounded-full bg-reward/10">
          <svg
            className="h-10 w-10 text-reward"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m4.5 12.5 5 5 10-11" />
          </svg>
        </span>
        <h2 className="text-xl font-bold">{t("paidTitle")}</h2>
        <p className="text-3xl font-bold">{amountText}</p>
        <p className="font-semibold">{payerName ? t("paidBy", { name: payerName }) : t("paidByGuest")}</p>
        {confirmedAt ? (
          <p className="text-sm text-muted">{t("confirmedAt", { time: timeFormat.format(confirmedAt) })}</p>
        ) : null}
        {registerName ? (
          <p className="text-sm text-muted">
            {t("register")}: {registerName}
          </p>
        ) : null}
        <button className={primaryButton} onClick={onAnother}>
          {t("anotherCharge")}
        </button>
      </section>
    );
  }

  if (status === "EXPIRED") {
    return (
      <section className={`${card} flex flex-col items-center gap-3 text-center`}>
        <h2 className="text-xl font-bold">{t("expiredTitle")}</h2>
        <p className="text-sm text-muted">{t("expiredHint")}</p>
        <button className={primaryButton} onClick={onAnother}>
          {t("anotherCharge")}
        </button>
      </section>
    );
  }

  return (
    <section className={`${card} flex flex-col items-center gap-4 text-center`}>
      <p className="text-xl font-semibold">{amountText}</p>
      <Image
        src={issued.qrDataUrl}
        width={240}
        height={240}
        unoptimized
        alt={t("qrAlt")}
        className="h-auto w-full max-w-60 rounded-card"
      />
      {status === "PROCESSING" ? (
        <p role="status" className="text-sm font-semibold">
          {t("confirming")}
        </p>
      ) : (
        <p role="status" className="text-sm text-muted">
          {t("waiting")}
        </p>
      )}
      <p className="text-sm text-muted">{t("expires", { time: timeFormat.format(new Date(issued.expiresAt)) })}</p>
      <button className={secondaryButton} onClick={onAnother}>
        {t("anotherCharge")}
      </button>
    </section>
  );
}
