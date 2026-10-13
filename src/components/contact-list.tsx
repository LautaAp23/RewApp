"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useWorkspace } from "@/lib/use-workspace";
import { useAccount } from "@/lib/account/account-context";
import { ContactAvatar, TrashIcon } from "./contact-picker";
import { ContactDetail } from "./contact-detail";
import { BottomSheet } from "./bottom-sheet";
import { WorkspaceError } from "./workspace-gate";
import { primaryButton, secondaryButton } from "./ui";

export function ContactList({ workspace, selected, onSelect }: {
  workspace: ReturnType<typeof useWorkspace>; selected: string[]; onSelect(addresses: string[]): void;
}) {
  const t = useTranslations("contactDetails"), s = useTranslations("social"), w = useTranslations("workspace");
  const { address } = useAccount();
  const [detailId, setDetailId] = useState<string>(), [selecting, setSelecting] = useState(false);
  const [menu, setMenu] = useState<"actions" | "create" | "add" | null>(null);
  const [name, setName] = useState(""), [kind, setKind] = useState("friends");
  const data = workspace.data;
  useEffect(() => { setDetailId(undefined); setMenu(null); setSelecting(false); }, [address]);
  if (!data) return null;
  const multiple = selecting || selected.length > 0;
  const finish = () => { setMenu(null); setSelecting(false); onSelect([]); };
  return <>
    <div className="flex min-h-12 items-center justify-end gap-2">
      {multiple ? <span className="mr-auto text-sm text-muted" role="status">{t("selected", { count: selected.length })}</span> : null}
      <button type="button" className="pressable min-h-12 px-3 text-sm text-accent" onClick={() => { if (multiple) finish(); else setSelecting(true); }}>{t(multiple ? "done" : "select")}</button>
      {selected.length ? <button type="button" aria-label={t("selectionActions")} aria-haspopup="dialog" className="pressable flex h-12 w-12 items-center justify-center rounded-full bg-elevated text-accent" onClick={() => setMenu("actions")}><svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg></button> : null}
    </div>
    <ul className="divide-y divide-elevated">{data.contacts.map(c => <li key={c.id}>
      <button type="button" className="pressable flex min-h-20 w-full items-center gap-3 py-3 text-left active:bg-elevated/40" aria-pressed={multiple ? selected.includes(c.address) : undefined} aria-haspopup={multiple ? undefined : "dialog"} onClick={() => {
        if (multiple) onSelect(selected.includes(c.address) ? selected.filter(a => a !== c.address) : [...selected, c.address]); else setDetailId(c.id);
      }}>
        {multiple ? <span aria-hidden className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${selected.includes(c.address) ? "border-primary bg-primary text-on-primary" : "border-muted"}`}>{selected.includes(c.address) ? "✓" : ""}</span> : null}
        <ContactAvatar label={c.label} /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{c.label}</span>{c.handle ? <span className="block truncate text-sm text-muted">@{c.handle}</span> : null}</span>
        {c.requestsBlocked ? <span className="sr-only">{t("blocked")}</span> : null}{!multiple ? <span aria-hidden className="text-muted">›</span> : null}
      </button>
    </li>)}</ul>
    <ContactDetail contact={data.contacts.find(c => c.id === detailId) ?? null} workspace={workspace} onClose={() => setDetailId(undefined)} />
    <BottomSheet open={!!menu} title={t(menu === "create" ? "createGroup" : menu === "add" ? "addToGroup" : "selectionActions")} onClose={() => setMenu(null)}>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-6 pb-6"><WorkspaceError code={workspace.error} />
        {menu === "actions" ? <>
          <button type="button" className={secondaryButton} disabled={selected.length > 11} onClick={() => setMenu("create")}>{t("createGroup")}</button>
          <button type="button" className={secondaryButton} disabled={!data.groups.length} onClick={() => setMenu("add")}>{t("addToGroup")}</button>
          <button type="button" disabled={workspace.busy} className="pressable flex min-h-12 items-center justify-center gap-3 rounded-button bg-error/10 px-4 text-error" onClick={async () => { if (await workspace.run("contact.removeMany", { ids: data.contacts.filter(c => selected.includes(c.address)).map(c => c.id) })) finish(); }}><TrashIcon />{t("deleteSelected", { count: selected.length })}</button>
          {selected.length > 11 ? <p className="text-sm text-muted">{t("groupLimit")}</p> : null}
        </> : menu === "create" ? <form className="flex flex-col gap-3" onSubmit={async e => { e.preventDefault(); if (await workspace.run("group.save", { name, kind, members: [address, ...selected] })) { setName(""); finish(); } }}>
          <label className="flex flex-col gap-2 text-sm">{s("groupName")}<input required maxLength={60} value={name} onChange={e => setName(e.target.value)} className="min-h-12 rounded-card border border-elevated bg-background px-4" /></label>
          <label className="flex flex-col gap-2 text-sm">{s("groupKind")}<select value={kind} onChange={e => setKind(e.target.value)} className="min-h-12 rounded-card border border-elevated bg-background px-4"><option value="friends">{s("friends")}</option><option value="family">{s("family")}</option></select></label>
          <button className={primaryButton} disabled={workspace.busy || !selected.length || selected.length > 11}>{workspace.busy ? w("working") : s("createGroup")}</button>
        </form> : menu === "add" ? <><p className="text-sm text-muted">{t("groupHint")}</p>{data.groups.map(g => {
          const count = new Set([...g.members, ...selected]).size;
          return <button type="button" key={g.id} disabled={workspace.busy || count > 12} className="pressable flex min-h-16 items-center justify-between gap-3 rounded-card border border-elevated px-4 text-left" onClick={async () => { if (await workspace.run("group.addMembers", { id: g.id, members: selected })) finish(); }}><span className="min-w-0 truncate">{g.name}</span><span className="shrink-0 text-xs text-muted">{count}/12</span></button>;
        })}</> : null}
      </div>
    </BottomSheet>
  </>;
}
