"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "@/lib/account/account-context";
import { type ReceiptKind, type ReceiptView } from "@/lib/api/receipt";
import { receiptDocument } from "@/lib/receipt-document";
import { ReceiptSkeleton } from "@/components/receipt-skeleton";
import { ReceiptActions } from "@/components/receipt-actions";
import { primaryButton, secondaryButton } from "@/components/ui";

export function ReceiptContent({ chargeId, kind, overlay = false }: { chargeId: string; kind?: ReceiptKind; overlay?: boolean }) {
  const { address, status, signViewReceipt } = useAccount();
  const t = useTranslations("receipt");
  const locale = useLocale();
  const [receipt, setReceipt] = useState<ReceiptView>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const document = useMemo(() => receipt ? receiptDocument(receipt, locale, t) : null, [receipt, locale, t]);
  useEffect(() => {
    if (!address || status !== "signed-in") return;
    if (!kind) { setFailed(true); return; }
    const controller = new AbortController();
    setReceipt(undefined);
    setFailed(false);
    void signViewReceipt(chargeId, kind).then(async (proof) => {
      if (proof.accountAddress.toLowerCase() !== address.toLowerCase()) throw new Error("session changed");
      const response = await fetch(`/api/receipts/${kind}/${encodeURIComponent(chargeId)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(proof), signal: controller.signal, cache: "no-store",
      });
      if (!response.ok) throw new Error("unavailable");
      const data = await response.json() as ReceiptView;
      if (!controller.signal.aborted) setReceipt(data);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [address, status, signViewReceipt, chargeId, kind, attempt]);

  return (
    <main className="receipt-page flex flex-1 flex-col gap-6">
      {!overlay ? <header className="receipt-actions"><h1 className="text-2xl font-semibold">{document?.title ?? t("title")}</h1></header> : null}
      {failed ? <div role="alert" className="flex flex-col gap-4"><p className="text-muted">{t("error")}</p><button className={primaryButton} onClick={() => setAttempt((value) => value + 1)}>{t("retry")}</button></div> : !document ? <ReceiptSkeleton /> : (
        <>
          <article className="receipt-paper flex flex-col gap-6 rounded-modal border border-white/10 bg-surface p-6">
            <header className="flex flex-col items-center gap-3 text-center">
              <span className="text-lg font-bold tracking-wide">RewApp</span>
              <span className="rounded-full bg-success/10 px-4 py-2 text-sm font-semibold text-success">{document.confirmed}</span>
              <h2 className="text-sm text-muted">{document.title}</h2>
              <p className="text-3xl font-bold">{document.amount}</p>
              <p className="font-semibold">{document.counterpart}</p>
            </header>
            <dl className="flex flex-col gap-4 border-y border-dashed border-white/20 py-6 text-sm">
              {document.rows.map((row) => <div key={row.label} className="flex justify-between gap-4"><dt className="text-muted">{row.label}</dt><dd className="text-right">{row.value}</dd></div>)}
            </dl>
            <div className="flex flex-col gap-3 text-xs"><p className="text-muted">{document.referenceLabel}</p><p className="break-all font-mono">{document.reference}</p><p className="text-muted">{document.operationLabel}</p><p className="break-all font-mono">{document.operation}</p></div>
            <p className="text-center text-xs text-muted">{document.timezone}</p>
          </article>
          <ReceiptActions document={document} />
        </>
      )}
      {!overlay ? <Link href="/inicio" className={`${secondaryButton} receipt-actions`}>{t("backHome")}</Link> : null}
    </main>
  );
}

