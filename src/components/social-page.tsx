"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { card, primaryButton, secondaryButton } from "@/components/ui";
import { WorkspaceGate, WorkspaceError } from "@/components/workspace-gate";
import { useAccount } from "@/lib/account/account-context";
import { accountCode, decodeAccountCode } from "@/lib/account-code";
import { useWorkspace } from "@/lib/use-workspace";
const input =
  "min-h-12 w-full rounded-card border border-elevated bg-surface px-4 py-3 text-text";
export function SocialPage({ chargeId }: { chargeId?: string }) {
  const t = useTranslations("social"),
    w = useTranslations("workspace");
  const account = useAccount(),
    workspace = useWorkspace();
  const { data, busy, run, reload } = workspace;
  const [label, setLabel] = useState(""),
    [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [kind, setKind] = useState("friends"),
    [selected, setSelected] = useState<string[]>([]),
    [groupId, setGroupId] = useState("");
  const [localError, setLocalError] = useState(false),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!data) return;
    const timer = setInterval(() => void reload(), 5000);
    return () => clearInterval(timer);
  }, [data, reload]);
  const toggle = (address: string) => {
    setGroupId("");
    setSelected((list) =>
      list.includes(address)
        ? list.filter((a) => a !== address)
        : [...list, address],
    );
  };
  const members = [account.address!, ...selected];
  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    const address = decodeAccountCode(code);
    setLocalError(!address);
    if (!address) return;
    if (await run("contact.save", { address, label })) {
      setLabel("");
      setCode("");
    }
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
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">{t("contacts")}</h2>
            <form className="flex flex-col gap-3" onSubmit={addContact}>
              <label className="flex flex-col gap-1 text-sm">
                {t("contactName")}
                <input
                  className={input}
                  value={label}
                  maxLength={60}
                  required
                  onChange={(e) => setLabel(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("accountCode")}
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
            <ul className="divide-y divide-elevated">
              {data.contacts.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-3">
                  <label className="flex min-h-12 min-w-0 flex-1 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(c.address)}
                      onChange={() => toggle(c.address)}
                    />
                    <span className="truncate">{c.label}</span>
                  </label>
                  <button
                    className="pressable min-h-12 px-3 text-sm text-muted"
                    disabled={busy}
                    onClick={() => void run("contact.remove", { id: c.id })}
                  >
                    {w("remove")}
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">{t("groups")}</h2>
            <p className="text-sm text-muted">{t("groupHint")}</p>
            <form
              className="flex flex-col gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await run("group.save", { name, kind, members })) {
                  setName("");
                  setSelected([]);
                }
              }}
            >
              <label className="flex flex-col gap-1 text-sm">
                {t("groupName")}
                <input
                  className={input}
                  value={name}
                  maxLength={60}
                  required
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("groupKind")}
                <select
                  className={input}
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="friends">{t("friends")}</option>
                  <option value="family">{t("family")}</option>
                </select>
              </label>
              <button
                className={secondaryButton}
                disabled={busy || !selected.length || selected.length > 11}
              >
                {t("createGroup")}
              </button>
            </form>
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
                    className="pressable min-h-12 px-3 text-sm text-muted"
                    disabled={busy}
                    onClick={() => void run("group.remove", { id: g.id })}
                  >
                    {w("remove")}
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {chargeId && (
            <section className={`${card} flex flex-col gap-3`}>
              <h2 className="text-lg font-bold">{t("divide")}</h2>
              <p className="text-sm text-muted">
                {t("divisionHint", { count: members.length })}
              </p>
              <button
                className={primaryButton}
                disabled={busy || !selected.length || selected.length > 11}
                onClick={() =>
                  void run("charge.split", {
                    charge: chargeId,
                    members,
                    ...(groupId ? { groupId } : {}),
                  })
                }
              >
                {t("confirmSplit")}
              </button>
            </section>
          )}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">{t("sharedBills")}</h2>
            {!data.splits.length && (
              <p className="text-sm text-muted">{t("emptySplits")}</p>
            )}
            {data.splits.map((s) => (
              <article key={s.id} className={`${card} flex flex-col gap-3`}>
                <div>
                  <h3 className="font-semibold">{s.merchant.name}</h3>
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
