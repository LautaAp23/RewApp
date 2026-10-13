"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { card, primaryButton, secondaryButton } from "@/components/ui";
import { ContactList } from "./contact-list";
import { TrashIcon } from "./contact-picker";
import { WorkspaceGate, WorkspaceError } from "@/components/workspace-gate";
import { useAccount } from "@/lib/account/account-context";
import { accountCode } from "@/lib/account-code";
import { normalizeHandle } from "@/lib/user-handle";
import { useWorkspace } from "@/lib/use-workspace";
const input =
  "min-h-12 w-full rounded-card border border-elevated bg-surface px-4 py-3 text-text";
export function SocialPage({ chargeId }: { chargeId?: string }) {
  const t = useTranslations("social"),
    w = useTranslations("workspace"), personal = useTranslations("personal");
  const account = useAccount(),
    workspace = useWorkspace();
  const { data, busy, run, reload } = workspace;
  const [label, setLabel] = useState(""),
    [code, setCode] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [groupId, setGroupId] = useState("");
  const [handle, setHandle] = useState("");
  const [localError, setLocalError] = useState(false),
    [copied, setCopied] = useState(false);
  const [newSplitId, setNewSplitId] = useState<string>();
  const splitArticle = useRef<HTMLElement | null>(null);
  const scrolledSplit = useRef<string | undefined>(undefined);
  const splitting = useRef(false);
  const activeAccount = useRef(account.address); activeAccount.current = account.address;
  const divided = !!chargeId && (newSplitId === chargeId || !!data?.splits.some(split => split.id === chargeId));
  useEffect(() => { setNewSplitId(undefined); scrolledSplit.current = undefined; }, [account.address, chargeId]);
  useEffect(() => {
    if (!newSplitId || scrolledSplit.current === newSplitId || !splitArticle.current) return;
    scrolledSplit.current = newSplitId;
    splitArticle.current.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    splitArticle.current.focus({ preventScroll: true });
  }, [newSplitId, data?.splits]);
  useEffect(() => { setSelected([]); setGroupId(""); }, [account.address]);
  useEffect(() => {
    if (!data) return;
    const timer = setInterval(() => void reload(), 5000);
    return () => clearInterval(timer);
  }, [data, reload]);
  const members = [account.address!, ...selected];
  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(false);
    if (await run("contact.save", { identifier: code, label })) {
      setLabel("");
      setCode("");
    }
  }
  async function confirmDivision() {
    if (!chargeId || divided || busy || splitting.current) return;
    const address = account.address;
    splitting.current = true;
    try {
      if (await run("charge.split", { charge: chargeId, members, ...(groupId ? { groupId } : {}) }) && activeAccount.current === address) {
        setNewSplitId(chargeId); setSelected([]); setGroupId("");
        window.dispatchEvent(new Event("rewapp:notifications-changed"));
      }
    } finally { splitting.current = false; }
  }
  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">
          {t(chargeId ? "splitTitle" : "title")}
        </h1>
        <p className="text-muted">{t(chargeId ? "splitBody" : "body")}</p>
      </header>
      {account.address && (
        <section className={`${card} flex flex-col gap-3`}>
          <h2 className="font-semibold">{t("myCode")}</h2>
          <p className="break-all select-all text-sm text-muted">
            {accountCode(account.address)}
          </p>
          <button
            className={secondaryButton}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  accountCode(account.address!),
                );
                setCopied(true);
              } catch {
                setLocalError(true);
              }
            }}
          >
            {t(copied ? "copied" : "copy")}
          </button>
        </section>
      )}
      <WorkspaceError code={workspace.error} />
      {localError && (
        <p role="alert" className="text-error">
          {t("invalidCode")}
        </p>
      )}
      {!data ? (
        <WorkspaceGate busy={busy} onConnect={() => void run("access")} />
      ) : (
        <>
          <form id="alias" className={`${card} flex flex-col gap-3`} onSubmit={async e => { e.preventDefault(); if (await run("alias.set", { handle })) setHandle(""); }}>
            <h2 className="font-semibold">{personal("yourAlias")}</h2>
            {data.handle ? <p className="font-semibold text-accent">@{data.handle}</p> : null}
            <p className="text-sm text-muted">{personal("aliasHint")}</p>
            <label className="flex flex-col gap-2 text-sm">{personal("alias")}<input className={input} value={handle} placeholder={data.handle ? "@" + data.handle : ""} autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={25} disabled={busy} required onChange={e => setHandle(e.target.value)} /></label>
            <button className={secondaryButton} disabled={busy || !normalizeHandle(handle)}>{personal("saveAlias")}</button>
          </form>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">{t("contacts")}</h2>
            <form className="flex flex-col gap-3" onSubmit={addContact}>
              <label className="flex flex-col gap-1 text-sm">
                {t("contactName")}
                <input
                  className={input}
                  value={label}
                  maxLength={60}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {personal("identifier")}
                <input
                  className={input}
                  value={code}
                  maxLength={80}
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
              <button className={secondaryButton} disabled={busy}>
                {w(busy ? "working" : "add")}
              </button>
            </form>
            {!data.contacts.length && (
              <p className="text-sm text-muted">{t("emptyContacts")}</p>
            )}
            <ContactList workspace={workspace} selected={selected} onSelect={addresses => { setGroupId(""); setSelected(addresses); }} />
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">{t("groups")}</h2>
            <p className="text-sm text-muted">{t("groupHint")}</p>

            <ul className="divide-y divide-elevated">
              {data.groups.map((g) => (
                <li key={g.id} className="flex items-center gap-3 py-3">
                  <button
                    className="pressable min-h-12 min-w-0 flex-1 text-left"
                    onClick={() => {
                      setSelected(
                        g.members.filter((a) => a !== account.address),
                      );
                      setGroupId(g.id);
                    }}
                  >
                    <span className="block font-semibold">{g.name}</span>
                    <span className="text-sm text-muted">
                      {t(g.kind === "family" ? "family" : "friends")} ·{" "}
                      {t("participants", { count: g.members.length })}
                    </span>
                  </button>
                  <button
                    aria-label={w("remove")} className="pressable flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-error/10 text-error"
                    disabled={busy}
                    onClick={() => void run("group.remove", { id: g.id })}
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {chargeId && (
            <section className={`${card} flex flex-col gap-3`}>
              <h2 className="text-lg font-bold">{t("divide")}</h2>
              {!divided ? <p className="text-sm text-muted">
                {t("divisionHint", { count: members.length })}
              </p> : null}
              <button
                className={primaryButton}
                disabled={busy || divided || !selected.length || selected.length > 11}
                onClick={() => void confirmDivision()}
              >
                {t(divided ? "splitCreated" : "confirmSplit")}
              </button>
            </section>
          )}
          <section className="flex flex-col gap-3">
            <h2 id="cuentas" className="scroll-mt-6 text-lg font-bold">{t("sharedBills")}</h2>
            {!data.splits.length && (
              <p className="text-sm text-muted">{t("emptySplits")}</p>
            )}
            {data.splits.map((s) => (
              <article key={s.id} ref={s.id === newSplitId ? splitArticle : undefined} tabIndex={s.id === newSplitId ? -1 : undefined} className={`${card} flex scroll-mt-6 flex-col gap-3`}>
                <div>
                  <div className="flex items-center justify-between gap-3"><h3 className="min-w-0 break-words font-semibold">{s.merchant.name}</h3>{s.id === newSplitId ? <span role="status" className="flex shrink-0 items-center gap-1.5 rounded-full bg-reward/10 px-2.5 py-1 text-xs font-semibold text-reward"><span aria-hidden className="h-2 w-2 rounded-full bg-reward" />{t("newSplit")}</span> : null}</div>
                  <p className="text-sm text-muted">
                    {s.localCurrency} {s.localAmount} ·{" "}
                    {t(
                      s.status === "PAID"
                        ? "completed"
                        : s.status === "EXPIRED"
                          ? "expired"
                          : "pending",
                    )}
                  </p>
                </div>
                <ul className="divide-y divide-elevated">
                  {s.parts.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3"
                    >
                      <div>
                        <p className="font-medium">
                          {p.expectedPayer === account.address
                            ? t("you")
                            : (data.contacts.find(
                                (c) => c.address === p.expectedPayer,
                              )?.label ?? t("participant"))}
                        </p>
                        <p className="text-sm text-muted">
                          {s.localCurrency} {p.localAmount} ·{" "}
                          {t(
                            p.status === "PAID"
                              ? "paid"
                              : p.status === "PROCESSING"
                                ? "processing"
                                : p.status === "EXPIRED"
                                  ? "expired"
                                  : "pending",
                          )}
                        </p>
                      </div>
                      {p.status === "PENDING" && (
                        <Link
                          className="pressable min-h-12 content-center px-2 text-sm font-semibold text-accent"
                          href={`/pagar/${p.id}`}
                        >
                          {t(
                            p.expectedPayer === account.address
                              ? "payPart"
                              : "openInvite",
                          )}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
                <button
                  className={secondaryButton}
                  onClick={async () => {
                    const text = s.parts
                      .filter((p) => p.status === "PENDING")
                      .map((p) => `${window.location.origin}/pagar/${p.id}`)
                      .join("\n");
                    try {
                      await navigator.clipboard.writeText(text);
                      setCopied(true);
                    } catch {
                      setLocalError(true);
                    }
                  }}
                >
                  {t(copied ? "copied" : "copyInvites")}
                </button>
              </article>
            ))}
          </section>
        </>
      )}
      <Link href="/inicio" className={secondaryButton}>
        {w("home")}
      </Link>
    </main>
  );
}
