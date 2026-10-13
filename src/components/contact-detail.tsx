"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { WorkspaceContact } from "@/lib/workspace-types";
import type { PersonalView } from "@/lib/personal-types";
import { useAccount } from "@/lib/account/account-context";
import { useWorkspace } from "@/lib/use-workspace";
import { accountCode } from "@/lib/account-code";
import { getAddress } from "viem";
import { receiptHref } from "@/lib/api/receipt";
import { BottomSheet } from "./bottom-sheet";
import { ContactAvatar, TrashIcon } from "./contact-picker";
import { ReceiptLink } from "./receipt-overlay";
import { Skeleton } from "./skeleton";
import { WorkspaceError } from "./workspace-gate";
import { secondaryButton } from "./ui";

export function ContactDetail({ contact, workspace, onClose }: {
  contact: WorkspaceContact | null; workspace: ReturnType<typeof useWorkspace>; onClose(): void;
}) {
  const t = useTranslations("contactDetails"), p = useTranslations("personal"), w = useTranslations("workspace"), locale = useLocale();
  const { address } = useAccount();
  const [movements, setMovements] = useState<PersonalView[]>(), [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const contactId = contact?.id;
  useEffect(() => {
    setMovements(undefined); setFailed(false);
    if (!contactId || !address) return;
    const controller = new AbortController();
    void fetch(`/api/contacts/${encodeURIComponent(contactId)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(result => { if (!controller.signal.aborted) setMovements(result.movements); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [contactId, address, retry]);
  return <BottomSheet open={!!contact} title={contact?.label ?? t("detail")} onClose={onClose}>
    {contact ? <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-6 pb-6">
      <WorkspaceError code={workspace.error} />
      <div className="flex items-center gap-3"><ContactAvatar label={contact.label} /><div className="min-w-0 flex-1">
        {contact.handle ? <p className="truncate text-accent">@{contact.handle}</p> : null}
        <p className="break-all text-xs text-muted">{accountCode(getAddress(contact.address))}</p>
        <p className="mt-2 text-xs text-muted">{contact.createdAt ? t("added", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(contact.createdAt)) }) : t("addedUnknown")}</p>
      </div></div>
      <div className="flex items-center gap-2">
        <Link className={`${secondaryButton} min-w-0 flex-1 px-3`} href={`/transferir?contact=${encodeURIComponent(contact.address)}`}>{p("send")}</Link>
        <Link className={`${secondaryButton} min-w-0 flex-1 px-3`} href={`/cobrar?contact=${encodeURIComponent(contact.address)}`}>{p("charge")}</Link>
        <button type="button" aria-label={w("remove")} disabled={workspace.busy} className="pressable flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-error/10 text-error" onClick={async () => { if (await workspace.run("contact.remove", { id: contact.id })) onClose(); }}><TrashIcon /></button>
      </div>
      <button type="button" role="switch" aria-checked={!!contact.requestsBlocked} disabled={workspace.busy} className="pressable flex min-h-14 items-center gap-3 rounded-card border border-elevated px-3 py-3 text-left" onClick={async () => {
        if (await workspace.run("contact.requests", { id: contact.id, blocked: !contact.requestsBlocked })) window.dispatchEvent(new Event("rewapp:notifications-changed"));
      }}><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{t("blockRequests")}</span><span className="mt-1 block text-xs text-muted">{t("blockHint")}</span></span><span aria-hidden className={`flex h-6 w-10 shrink-0 items-center rounded-full p-1 ${contact.requestsBlocked ? "bg-primary" : "bg-elevated"}`}><span className={`h-4 w-4 rounded-full bg-text transition-transform ${contact.requestsBlocked ? "translate-x-4" : ""}`} /></span></button>
      <section className="flex flex-col gap-2"><h3 className="font-semibold">{t("movements")}</h3><p className="text-xs text-muted">{t("movementsHint")}</p>
        {!movements && !failed ? <div aria-busy="true" className="flex flex-col gap-3"><span role="status" className="sr-only">{p("loading")}</span>{[0, 1, 2].map(i => <Skeleton key={i} className="h-16 w-full rounded-card" />)}</div> : null}
        {failed ? <><p role="alert" className="text-sm text-error">{t("loadFailed")}</p><button className={secondaryButton} onClick={() => setRetry(i => i + 1)}>{p("retry")}</button></> : null}
        {movements?.length === 0 ? <p className="py-4 text-sm text-muted">{t("emptyMovements")}</p> : null}
        <ul className="divide-y divide-elevated">{movements?.map(m => <li key={m.id}><ReceiptLink href={receiptHref("transfer", m.id)} className="pressable flex min-h-20 items-center gap-3 py-3">
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-elevated text-accent">{m.payer === address ? "↗" : "↙"}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{t(m.payer === address ? "sent" : "received")}</span><span className="block text-xs text-muted">{m.paidAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(m.paidAt)) : ""}</span></span>
          <span className="shrink-0 text-sm font-semibold">{m.localCurrency} {m.localAmount}</span>
        </ReceiptLink></li>)}</ul>
      </section>
    </div> : null}
  </BottomSheet>;
}
