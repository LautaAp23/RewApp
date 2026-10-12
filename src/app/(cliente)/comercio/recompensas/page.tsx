"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { card, primaryButton, secondaryButton } from "@/components/ui";
import { WorkspaceGate, WorkspaceError } from "@/components/workspace-gate";
import { useAccount } from "@/lib/account/account-context";
import { chainClient } from "@/lib/chain-client";
import { requireContractAddresses, rewAppPayAbi } from "@/lib/contracts";
import { parseDecimal } from "@/lib/money";
import { useWorkspace } from "@/lib/use-workspace";
const input =
  "min-h-12 w-full rounded-card border border-elevated bg-surface px-4 py-3 text-text";
export default function Page() {
  const t = useTranslations("merchantRewards"),
    w = useTranslations("workspace");
  const account = useAccount(),
    workspace = useWorkspace();
  const { data, run, busy, reload } = workspace;
  const merchantId = data?.merchant?.id;
  const [selected, setSelected] = useState<number>(),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [active, setActive] = useState(true),
    [code, setCode] = useState("");
  const [ruleType, setRuleType] = useState(0),
    [percent, setPercent] = useState("10"),
    [min, setMin] = useState("0"),
    [visits, setVisits] = useState("5"),
    [ruleActive, setRuleActive] = useState(true),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState<"failed" | "pending" | "saved">();
  const [eventTitle, setEventTitle] = useState(""),
    [eventDescription, setEventDescription] = useState(""),
    [eventDays, setEventDays] = useState("7"),
    [publishing, setPublishing] = useState(false),
    [eventMessage, setEventMessage] = useState<
      "published" | "eventActiveExists" | "eventFailed" | undefined
    >();
  useEffect(() => {
    if (!data) return;
    const timer = setInterval(() => void reload(), 5000);
    return () => clearInterval(timer);
  }, [data, reload]);
  useEffect(() => {
    if (!merchantId) return;
    let cancelled = false;
    void fetch("/api/merchant-rules", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((result) => {
        if (cancelled || !result) return;
        const rule = result.rules[ruleType];
        setPercent((rule.valueBps / 100).toString());
        setMin(rule.minimum);
        setVisits(String(rule.visitsGoal || 5));
        setRuleActive(rule.active);
      })
      .catch(() => setMessage("failed"));
    return () => {
      cancelled = true;
    };
  }, [merchantId, ruleType]);
  async function saveRule(e: React.FormEvent) {
    e.preventDefault();
    if (!account.address || saving) return;
    setSaving(true);
    setMessage(undefined);
    try {
      const { rewAppPay } = requireContractAddresses();
      const nonce = await chainClient.readContract({
        address: rewAppPay,
        abi: rewAppPayAbi,
        functionName: "nonces",
        args: [account.address],
      });
      const valueBps = Number(parseDecimal(percent, 2));
      if (valueBps > 5000) throw new Error();
      const intent = {
        merchant: account.address,
        ruleType: ruleType as 0 | 1,
        minAmount: parseDecimal(min, 6),
        valueBps,
        fixedAmount: 0n,
        visitsGoal: ruleType === 1 ? Number(visits) : 0,
        active: ruleActive,
        nonce,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 300),
      };
      const signature = await account.signMerchantRule(intent);
      const response = await fetch("/api/merchant-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: {
            ...intent,
            minAmount: intent.minAmount.toString(),
            fixedAmount: "0",
            nonce: nonce.toString(),
            deadline: intent.deadline.toString(),
          },
          signature,
        }),
      });
      const result = await response.json();
      setMessage(
        !response.ok || result.status === "reverted"
          ? "failed"
          : result.status === "pending"
            ? "pending"
            : "saved",
      );
    } catch {
      setMessage("failed");
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-muted">{t("body")}</p>
      </header>
      <WorkspaceError code={workspace.error} />
      {!data ? (
        <WorkspaceGate busy={busy} onConnect={() => void run("access")} />
      ) : !data.merchant ? (
        <p className={card}>{t("notMerchant")}</p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">{data.merchant.name}</h2>
            <p className="text-sm text-muted">{t("catalogHint")}</p>
            {!data.merchantRewards.length && (
              <p className="text-sm text-muted">{t("empty")}</p>
            )}
            <ul className="divide-y divide-elevated">
              {data.merchantRewards.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 py-4"
                >
                  <div className="min-w-0">
                    <h3 className="font-semibold">{r.title}</h3>
                    <p className="text-sm text-muted">
                      {t("points", { count: r.pointsCost })} ·{" "}
                      {t(r.active ? "active" : "paused")}
                    </p>
                  </div>
                  <button
                    className="pressable min-h-12 px-3 text-accent"
                    onClick={() => {
                      setSelected(r.id);
                      setTitle(r.title);
                      setDescription(r.description);
                      setActive(r.active);
                    }}
                  >
                    {w("edit")}
                  </button>
                </li>
              ))}
            </ul>
            {selected !== undefined && (
              <form
                className={`${card} flex flex-col gap-3`}
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await run("reward.update", {
                      id: selected,
                      title,
                      description,
                      active,
                    })
                  )
                    setSelected(undefined);
                }}
              >
                <label className="flex flex-col gap-1 text-sm">
                  {t("rewardTitle")}
                  <input
                    className={input}
                    required
                    maxLength={100}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  {t("description")}
                  <textarea
                    className={input}
                    required
                    maxLength={500}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
                <label className="flex min-h-12 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                  />
                  {t("active")}
                </label>
                <button className={primaryButton} disabled={busy}>
                  {w(busy ? "working" : "save")}
                </button>
                <button
                  type="button"
                  className={secondaryButton}
                  disabled={busy}
                  onClick={() => setSelected(undefined)}
                >
                  {w("cancel")}
                </button>
              </form>
            )}
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">{t("rules")}</h2>
            <p className="text-sm text-muted">{t("ruleHint")}</p>
            <form className="flex flex-col gap-3" onSubmit={saveRule}>
              <label className="flex flex-col gap-1 text-sm">
                {t("template")}
                <select
                  className={input}
                  value={ruleType}
                  onChange={(e) => setRuleType(Number(e.target.value))}
                >
                  <option value={0}>{t("cashback")}</option>
                  <option value={1}>{t("visitBonus")}</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("percent")}
                <input
                  className={input}
                  type="number"
                  min="0"
                  max="50"
                  step="0.01"
                  required
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("minimum")}
                <input
                  className={input}
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={min}
                  onChange={(e) => setMin(e.target.value)}
                />
              </label>
              {ruleType === 1 && (
                <label className="flex flex-col gap-1 text-sm">
                  {t("visits")}
                  <input
                    className={input}
                    type="number"
                    min="1"
                    max="10000"
                    required
                    value={visits}
                    onChange={(e) => setVisits(e.target.value)}
                  />
                </label>
              )}
              <label className="flex min-h-12 items-center gap-3">
                <input
                  type="checkbox"
                  checked={ruleActive}
                  onChange={(e) => setRuleActive(e.target.checked)}
                />
                {t("active")}
              </label>
              <button className={primaryButton} disabled={saving || busy}>
                {w(saving ? "working" : "save")}
              </button>
            </form>
            {message && (
              <p
                role="status"
                className={message === "failed" ? "text-error" : "text-success"}
              >
                {t(message)}
              </p>
            )}
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">{t("events")}</h2>
            <p className="text-sm text-muted">{t("eventsHint")}</p>
            <form
              className="flex flex-col gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (publishing) return;
                setPublishing(true);
                setEventMessage(undefined);
                try {
                  const days = Math.min(30, Math.max(1, Number(eventDays) || 0));
                  if (!days) throw new Error();
                  const startsAt = new Date();
                  const response = await fetch("/api/events", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      title: eventTitle.trim(),
                      description: eventDescription.trim(),
                      startsAt: startsAt.toISOString(),
                      endsAt: new Date(startsAt.getTime() + days * 24 * 60 * 60 * 1000).toISOString(),
                    }),
                  });
                  if (!response.ok) {
                    const result = (await response.json().catch(() => null)) as {
                      error?: string;
                    } | null;
                    setEventMessage(
                      result?.error === "event_active_exists"
                        ? "eventActiveExists"
                        : "eventFailed",
                    );
                    return;
                  }
                  setEventTitle("");
                  setEventDescription("");
                  setEventDays("7");
                  setEventMessage("published");
                } catch {
                  setEventMessage("eventFailed");
                } finally {
                  setPublishing(false);
                }
              }}
            >
              <label className="flex flex-col gap-1 text-sm">
                {t("eventTitle")}
                <input
                  className={input}
                  required
                  maxLength={80}
                  minLength={2}
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("eventDescription")}
                <textarea
                  className={input}
                  required
                  maxLength={280}
                  minLength={2}
                  value={eventDescription}
                  onChange={(e) => setEventDescription(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                {t("eventDays")}
                <input
                  className={input}
                  type="number"
                  min="1"
                  max="30"
                  required
                  value={eventDays}
                  onChange={(e) => setEventDays(e.target.value)}
                />
              </label>
              <button className={secondaryButton} disabled={publishing || busy}>
                {t(publishing ? "publishing" : "publish")}
              </button>
            </form>
            {eventMessage && (
              <p
                role="status"
                className={eventMessage === "eventFailed" ? "text-error" : "text-success"}
              >
                {t(eventMessage)}
              </p>
            )}
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">{t("deliveries")}</h2>
            <p className="text-sm text-muted">{t("deliveryHint")}</p>
            <form
              className="flex flex-col gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await run("redemption.deliver", { pickupCode: code.trim() })
                )
                  setCode("");
              }}
            >
              <label className="flex flex-col gap-1 text-sm">
                {t("pickupCode")}
                <input
                  className={input}
                  value={code}
                  required
                  maxLength={100}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
              <button className={secondaryButton} disabled={busy}>
                {t("deliver")}
              </button>
            </form>
            {!data.deliveries.length && (
              <p className="text-sm text-muted">{t("emptyDeliveries")}</p>
            )}
            <ul className="divide-y divide-elevated">
              {data.deliveries.map((r) => (
                <li key={r.id} className="flex flex-col gap-1 py-3">
                  <h3 className="font-semibold">{r.title}</h3>
                  <p className="text-sm text-muted">
                    {t(r.status === "DELIVERED" ? "delivered" : "ready")}
                  </p>
                  {r.status === "READY" && (
                    <p className="break-all text-sm text-reward">
                      {r.pickupCode}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      <Link className={secondaryButton} href="/inicio">
        {w("home")}
      </Link>
    </main>
  );
}
