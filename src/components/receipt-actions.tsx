"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { primaryButton, secondaryButton } from "./ui";
import type { ReceiptDocument } from "@/lib/receipt-document";

export function ReceiptActions({ document, shareOnly = false }: { document: ReceiptDocument; shareOnly?: boolean }) {
  const t = useTranslations("receipt");
  const prepared = useRef<File | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState<"shareError">();
  useEffect(() => {
    let stopped = false;
    prepared.current = null;
    setReady(false);
    setMessage(undefined);
    void import("@/lib/receipt-pdf").then(({ receiptPdf }) => {
      const file = receiptPdf(document);
      if (!stopped) { prepared.current = file; setReady(true); }
    }).catch(() => { if (!stopped) setMessage("shareError"); });
    return () => { stopped = true; prepared.current = null; };
  }, [document]);

  async function share() {
    const file = prepared.current;
    if (!file || lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage(undefined);
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        // The PDF is prepared before the click to preserve browser user activation.
        await navigator.share({ files: [file], title: document.title });
      } else {
        const { downloadReceipt } = await import("@/lib/receipt-pdf");
        downloadReceipt(file);
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) setMessage("shareError");
    } finally { lock.current = false; setBusy(false); }
  }

  if (shareOnly) return <div className="flex flex-col gap-3"><button type="button" className={`${secondaryButton} gap-2`} disabled={!ready || busy} onClick={() => void share()}><svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></svg>{t("share")}</button>{message ? <p role="status" className="text-sm text-muted">{t(message)}</p> : null}</div>;

  return <div className="receipt-actions flex flex-col gap-3">
    <div className="flex items-center gap-3">
      <button className={`${primaryButton} min-w-0 flex-1 gap-2`} onClick={() => window.print()}>
        <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M7 8V3h10v5M7 16H4V8h16v8h-3M7 13h10v8H7z" /></svg>
        {t("print")}
      </button>
      <button type="button" aria-label={t("share")} title={t("share")} className="pressable flex h-14 w-14 shrink-0 items-center justify-center rounded-full gradient-primary text-on-primary shadow-glow disabled:opacity-50" disabled={!ready || busy} onClick={() => void share()}>
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></svg>
      </button>
    </div>
    {message ? <p role="status" className="text-sm text-muted">{t(message)}</p> : null}
  </div>;
}
