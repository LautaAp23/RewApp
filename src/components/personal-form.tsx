"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useWorkspace } from "@/lib/use-workspace";
import { useCurrency } from "@/lib/use-currency";
import { useAccount } from "@/lib/account/account-context";
import { isCurrency } from "@/lib/money";
import { WorkspaceGate, WorkspaceError } from "./workspace-gate";
import { card, primaryButton, secondaryButton } from "./ui";
import { FxNote } from "./fx-note";
import { ContactPicker, QrIcon } from "./contact-picker";
import { requestContactName } from "@/lib/request-contact-name";
const input = "min-h-12 w-full rounded-card border border-elevated bg-surface px-4 py-3 text-text";
export function PersonalForm({ mode }: { mode: "DIRECT" | "REQUEST" }) {
  const t = useTranslations("personal"), router = useRouter(), search = useSearchParams();
  const { address } = useAccount(), currency = useCurrency(address), { data, busy, error, run } = useWorkspace();
  const [contact, setContact] = useState(search.get("contact") ?? ""), [amount, setAmount] = useState(""), [note, setNote] = useState("");
  const [pendingId, setPendingId] = useState<string>();
  const [qrMode, setQrMode] = useState(false);
  const details = useTranslations("contactDetails");
  const initialContact = search.get("contact") ?? "";
  useEffect(() => { setContact(initialContact); setAmount(""); setNote(""); setPendingId(undefined); setQrMode(false); }, [address, mode, initialContact]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !isCurrency(currency) || (!qrMode && !contact)) return;
    const id = pendingId ?? crypto.randomUUID(); setPendingId(id);
    if (await run("personal.create", { id, kind: mode, contact: qrMode ? "" : contact, amount: amount.replace(",", "."), currency, note })) router.push(`/pagar/p2p_${id}`);
  }
  return <main className="flex flex-col gap-6">
    <header><h1 className="text-2xl font-bold">{t(mode === "DIRECT" ? "transfer" : "request")}</h1><p className="mt-2 text-sm text-muted">{t(mode === "DIRECT" ? "transferHint" : "requestHint")}</p></header>
    <WorkspaceError code={error} />
    {!data ? <WorkspaceGate busy={busy} onConnect={() => void run("access")} /> : <>
      <form onSubmit={submit} className={`${card} flex flex-col gap-4`}>
        <div className="flex flex-col gap-2"><p className="text-sm">{t("contact")}</p><div className="flex items-center gap-2">
          <div className="min-w-0 flex-1"><ContactPicker contacts={data.contacts} value={qrMode ? "" : contact} disabled={busy} onChange={address => { setContact(address); setQrMode(false); setPendingId(undefined); }} /></div>
          {mode === "REQUEST" ? <button type="button" aria-label={details("qrMode")} aria-pressed={qrMode} disabled={busy} onClick={() => { setQrMode(value => !value); setPendingId(undefined); }} className={`pressable flex h-16 w-16 shrink-0 items-center justify-center rounded-card border ${qrMode ? "border-primary bg-primary text-on-primary" : "border-elevated bg-elevated text-accent"}`}><QrIcon /></button> : null}
        </div><p className="text-sm text-muted">{details(qrMode ? "qrOnlyHint" : mode === "REQUEST" ? "contactOnlyHint" : "transferContactHint")}</p></div>
        <Link className="min-h-11 content-center text-sm text-accent" href="/amigos">{t("manageContacts")}</Link>
        <label className="flex flex-col gap-2 text-sm">{t("amount", { currency })}<input className={input} inputMode="decimal" value={amount} maxLength={20} pattern="[0-9]+([.,][0-9]{1,2})?" required disabled={busy} onChange={e => { setAmount(e.target.value); setPendingId(undefined); }} /></label>
        <FxNote />
        <label className="flex flex-col gap-2 text-sm">{t("note")}<input className={input} value={note} maxLength={120} disabled={busy} onChange={e => { setNote(e.target.value); setPendingId(undefined); }} /></label>
        <button className={primaryButton} disabled={busy || (!qrMode && !contact)}>{busy ? t("loading") : mode === "DIRECT" ? t("continue") : details(qrMode ? "createQr" : "sendRequest")}</button>
      </form>
      {mode === "REQUEST" ? <section className="flex flex-col gap-3"><h2 className="font-semibold">{t("requests")}</h2>{data.personalCharges.filter(c => c.kind === "REQUEST" && c.recipient === address && (c.status === "PROCESSING" || (c.status === "PENDING" && new Date(c.expiresAt).getTime() > Date.now()))).map(c => <Link key={c.id} className={`${card} pressable flex min-h-16 items-center justify-between gap-3`} href={`/pagar/p2p_${c.id}`}><span className="min-w-0 flex-1"><span className="block truncate font-medium">{requestContactName(c.expectedPayer, data.contacts, details("qrMode"))}</span>{c.note ? <span className="block truncate text-sm text-muted">{c.note}</span> : null}</span><span className="shrink-0 text-sm">{c.localCurrency} {c.localAmount} · {t(c.status === "PROCESSING" ? "processing" : "pending")}</span></Link>)}</section> : null}
    </>}
    <Link href="/inicio" className={secondaryButton}>{t("home")}</Link>
  </main>;
}
