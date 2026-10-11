"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BottomSheet } from "./bottom-sheet";
import { primaryButton, secondaryButton } from "./ui";

type DemoCharge = { id: string; localAmount: string; localCurrency: string; expiresAt: string; qrDataUrl: string };

export function DemoChargeTool() {
  const t = useTranslations("demoCharge");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [charge, setCharge] = useState<DemoCharge>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [expired, setExpired] = useState(false);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!charge) return;
    const remaining = new Date(charge.expiresAt).getTime() - Date.now();
    setExpired(remaining <= 0);
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, remaining));
    return () => window.clearTimeout(timer);
  }, [charge]);

  async function generate() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    controller.current = new AbortController();
    try {
      const response = await fetch("/api/dev/charge", { method: "POST", signal: controller.current.signal });
      if (!response.ok) throw new Error("demo charge failed");
      setCharge(await response.json());
    } catch {
      if (!controller.current.signal.aborted) setFailed(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <>
    <button className={`${secondaryButton} gap-2 border-dashed`} onClick={() => { setOpen(true); if (!charge) void generate(); }}>{t("button")}</button>
    <BottomSheet open={open} title={t("title")} description={t("description")} onClose={() => setOpen(false)}>
      <div className="flex min-h-0 flex-col items-center gap-4 overflow-y-auto px-6 pb-6 text-center">
        {charge ? <>
          <p className="text-xl font-semibold">{new Intl.NumberFormat(locale, { style: "currency", currency: charge.localCurrency }).format(Number(charge.localAmount))}</p>
          {expired ? <p role="status" className="text-sm text-error">{t("expired")}</p> : <>
            <Image src={charge.qrDataUrl} width={240} height={240} unoptimized alt={t("qrAlt")} className="h-auto w-full max-w-60 rounded-card" />
            <p className="text-sm text-muted">{t("expires", { time: new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(charge.expiresAt)) })}</p>
            <Link href={`/pagar/${charge.id}`} className={primaryButton} onClick={() => setOpen(false)}>{t("openPayment")}</Link>
          </>}
        </> : null}
        {busy ? <p role="status" className="text-sm text-muted">{t("generating")}</p> : null}
        {failed ? <p role="alert" className="text-sm text-error">{t("error")}</p> : null}
        <button className={secondaryButton} disabled={busy} onClick={() => void generate()}>{t(failed ? "retry" : "generateAnother")}</button>
      </div>
    </BottomSheet>
  </>;
}
