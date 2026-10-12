"use client";

import { useTranslations } from "next-intl";

export function ReceiptSkeleton() {
  const t = useTranslations("receipt");
  return <div className="flex flex-col gap-5" aria-busy="true">
    <p role="status" className="text-center text-sm text-muted">{t("loading")}</p>
    <div aria-hidden="true" className="flex flex-col gap-6 rounded-modal border border-white/10 bg-surface p-6">
      <div className="flex flex-col items-center gap-4">
        <div className="shimmer h-6 w-24 rounded-full bg-elevated" />
        <div className="shimmer h-9 w-40 rounded-full bg-elevated" />
        <div className="shimmer h-12 w-36 rounded-card bg-elevated" />
        <div className="shimmer h-5 w-28 rounded-full bg-elevated" />
      </div>
      <div className="flex flex-col gap-5 border-y border-dashed border-white/20 py-6">
        {[0, 1, 2].map((row) => <div key={row} className="flex justify-between gap-4"><div className="shimmer h-4 w-20 rounded-full bg-elevated" /><div className="shimmer h-4 w-28 rounded-full bg-elevated" /></div>)}
      </div>
      <div className="shimmer h-4 w-24 rounded-full bg-elevated" />
      <div className="shimmer h-10 w-full rounded-card bg-elevated" />
    </div>
    <div aria-hidden="true" className="flex gap-3"><div className="shimmer h-14 flex-1 rounded-full bg-elevated" /><div className="shimmer h-14 w-14 rounded-full bg-elevated" /></div>
  </div>;
}
