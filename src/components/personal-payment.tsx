"use client";
import Link from "next/link";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "@/lib/account/account-context";
import { useWorkspace } from "@/lib/use-workspace";
import type { PersonalView } from "@/lib/personal-types";
import { formatMoney } from "@/lib/money";
import { PaymentSuccess } from "./payment-success";
import { accountCode } from "@/lib/account-code";
import { requestContactName } from "@/lib/request-contact-name";
import { getAddress } from "viem";
import { SlideToPay } from "./slide-to-pay";
import { Skeleton } from "./skeleton";
import { FxNote } from "./fx-note";
import { WorkspaceError, WorkspaceGate } from "./workspace-gate";
import { card, primaryButton, secondaryButton } from "./ui";

type Details = PersonalView & { spender: `0x${string}`; nonce: string; url: string; qrDataUrl: string | null };
export function PersonalPayment({ id }: { id: string }) {
  const t = useTranslations("personal"), locale = useLocale(), account = useAccount();
  const detailsText = useTranslations("contactDetails");
  const { data, busy, run, error: workspaceError } = useWorkspace();
  const [charge, setCharge] = useState<Details>(), [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false), [error, setError] = useState<string>(), [copied, setCopied] = useState(false);
  const active = useRef(account.address); active.current = account.address;
  const load = useCallback(async () => {
    if (!data || data.account !== account.address) return;
    const address = account.address;
    try {
      const response = await fetch(`/api/personal/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("unavailable");
      const value = await response.json();
      if (active.current === address) { setCharge(value); setLoading(false); }
    } catch { if (active.current === address) { setError("unavailable"); setLoading(false); } }
  }, [data, account.address, id]);
  useEffect(() => { setCharge(undefined); setLoading(true); setError(undefined); void load(); }, [load]);
  useEffect(() => {
    if (!charge || (charge.status !== "PENDING" && charge.status !== "PROCESSING")) return;
    const timer = setInterval(() => { if (!paying) void load(); }, 5000);
    return () => clearInterval(timer);
  }, [charge, load, paying]);
  async function pay() {
    if (!charge || paying || !account.address) return;
    const address = account.address;
    setPaying(true); setError(undefined);
    try {
      const signed = await account.signPersonalPayment(charge);
      if (active.current !== address) return;
      const proof = await account.signPersonalAccess();
      const session = await fetch("/api/personal/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(proof) });
      if (!session.ok || active.current !== address) throw new Error("unavailable");
      const response = await fetch("/api/personal/pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(signed) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (active.current === address) { setCharge({ ...charge, ...result }); window.dispatchEvent(new Event("rewapp:notifications-changed")); }
    } catch (caught) { if (active.current === address) setError(caught instanceof Error ? caught.message : "failed"); }
    finally { setPaying(false); }
  }
  const own = charge?.recipient === account.address;
  const displayName = charge && own && charge.kind === "REQUEST" ? requestContactName(charge.expectedPayer, data?.contacts ?? [], detailsText("qrMode")) : charge?.recipientName;
  const displayAddress = charge && own && charge.kind === "REQUEST" ? charge.expectedPayer : charge?.recipient;
  const unavailable = charge && ["EXPIRED", "CANCELLED"].includes(charge.status);
  const errorKey = error === "insufficient_funds" ? "insufficientFunds" : error === "payer_busy" ? "payerBusy" : "failed";
  if (!loading && data?.account === account.address && charge?.id === id && charge.status === "PAID") return <PaymentSuccess id={id} kind="transfer" title={t(own ? "receivedTitle" : "successTitle", { amount: formatMoney(Number(charge.localAmount), charge.localCurrency, locale), name: own ? charge.payerName ?? "" : charge.recipientName })} />;
  return <main className="flex flex-col gap-6">
    <h1 className="text-2xl font-bold">{t(own ? "yourRequest" : "transfer")}</h1>
    <WorkspaceError code={workspaceError} />
    {!data ? <WorkspaceGate busy={busy} onConnect={() => void run("access")} /> : <>
      {loading ? <div aria-busy="true" className="flex flex-col items-center gap-5"><p className="sr-only" role="status">{t("loading")}</p><Skeleton className="h-20 w-20 rounded-full" /><Skeleton className="h-8 w-48" /><Skeleton className="h-12 w-full" /></div> : charge ? <>
        <section className={`${card} flex flex-col items-center gap-3 text-center`}>
          <span aria-hidden className="flex h-16 w-16 items-center justify-center rounded-full bg-elevated text-2xl text-accent">{displayName?.slice(0, 1).toUpperCase()}</span>
          <p className="break-words font-semibold">{displayName}</p>
          {displayAddress ? <p className="break-all text-xs text-muted">{accountCode(getAddress(displayAddress))}</p> : null}
          <p className="text-4xl font-bold">{formatMoney(Number(charge.localAmount), charge.localCurrency, locale)}</p>
          {charge.note ? <p className="break-words text-sm text-muted">{charge.note}</p> : null}
          <p className="text-sm text-muted">{t("noPoints")}</p>
          <FxNote />
        </section>
        {unavailable ? <p role="status" className="text-muted">{t(charge.status === "EXPIRED" ? "expired" : "cancelled")}</p> : charge.status === "PROCESSING" ? <div className={`${card} flex flex-col gap-3`}>
          <p role="status">{t("processing")}</p><button className={secondaryButton} onClick={() => void load()}>{t("retry")}</button>
          <Link href="/cargar" className={secondaryButton}>{t("topUp")}</Link>
        </div> : own ? <>
          {charge.qrDataUrl ? <div className="mx-auto w-full max-w-80 rounded-modal bg-white p-3"><Image unoptimized src={charge.qrDataUrl} alt={t("qrAlt")} width={320} height={320} className="h-auto w-full" /></div> : null}
          <p className="text-center text-sm text-muted">{t(charge.expectedPayer ? "sent" : "qrHint")}</p>
          {!charge.expectedPayer ? <button className={primaryButton} onClick={async () => {
            try { if (navigator.share) await navigator.share({ title: t("request"), url: charge.url }); else { await navigator.clipboard.writeText(charge.url); setCopied(true); } }
            catch (caught) { if (!(caught instanceof DOMException && caught.name === "AbortError")) setError("failed"); }
          }}>{t(copied ? "copied" : "share")}</button> : null}
          <button className={secondaryButton} disabled={busy} onClick={async () => { if (await run("personal.cancel", { id })) void load(); }}>{t("cancelRequest")}</button>
        </> : <>
          <p className="text-center text-sm text-muted">{t("confirmHint")}</p>
          <SlideToPay amount={formatMoney(Number(charge.localAmount), charge.localCurrency, locale)} busy={paying} onConfirm={pay} />
        </>}
      </> : null}
      {error ? <div role="alert" className="flex flex-col gap-3"><p className="text-sm text-error">{t(errorKey)}</p><button className={secondaryButton} disabled={paying} onClick={() => { setError(undefined); void load(); }}>{t("retry")}</button></div> : null}
    </>}
    <Link href="/inicio" className={secondaryButton}>{t("home")}</Link>
  </main>;
}
