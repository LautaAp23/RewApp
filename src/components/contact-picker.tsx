"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { WorkspaceContact } from "@/lib/workspace-types";
import { BottomSheet } from "./bottom-sheet";

export function ContactAvatar({ label }: { label: string }) {
  const initials = label.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-elevated text-sm font-semibold text-accent">{initials}</span>;
}

export function ContactPicker({ contacts, value, onChange, disabled }: {
  contacts: WorkspaceContact[]; value: string; onChange(address: string): void; disabled?: boolean;
}) {
  const t = useTranslations("contactDetails"), p = useTranslations("personal");
  const [open, setOpen] = useState(false), [search, setSearch] = useState("");
  const current = contacts.find(c => c.address === value);
  const matches = contacts.filter(c => `${c.label} ${c.handle ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <>
    <button type="button" disabled={disabled} onClick={() => { setSearch(""); setOpen(true); }} aria-haspopup="dialog" className="pressable flex min-h-16 w-full min-w-0 items-center gap-3 rounded-card border border-elevated bg-surface px-3 text-left">
      {current ? <ContactAvatar label={current.label} /> : <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-elevated text-accent">+</span>}
      <span className="min-w-0 flex-1 truncate text-sm">{current?.label ?? p("chooseContact")}</span><span aria-hidden className="text-muted">⌄</span>
    </button>
    <BottomSheet open={open} title={p("chooseContact")} onClose={() => setOpen(false)}>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-6 pb-6">
        <label className="flex flex-col gap-2 text-sm">{t("search")}<input type="search" value={search} autoComplete="off" className="min-h-12 w-full rounded-card border border-elevated bg-background px-4" onChange={e => setSearch(e.target.value)} /></label>
        <ul className="divide-y divide-elevated">{matches.map(c => <li key={c.id}><button type="button" onClick={() => { onChange(c.address); setOpen(false); }} className="pressable flex min-h-20 w-full items-center gap-3 py-3 text-left" aria-pressed={value === c.address}>
          <ContactAvatar label={c.label} /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{c.label}</span>{c.handle ? <span className="block truncate text-sm text-muted">@{c.handle}</span> : null}</span>{value === c.address ? <span aria-hidden className="text-accent">✓</span> : null}
        </button></li>)}</ul>
        {!matches.length ? <p className="py-4 text-sm text-muted">{t("noMatches")}</p> : null}
      </div>
    </BottomSheet>
  </>;
}

export function TrashIcon() {
  return <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>;
}

export function QrIcon() {
  return <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" className="h-6 w-6"><path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6zM12 3v3M3 12h3M12 12h3M21 12v3M12 18v3" /></svg>;
}
