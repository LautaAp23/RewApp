"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { use } from "react";
import { isAddress } from "viem";
import { BusinessMenu } from "@/components/business-menu";
import { WorkspaceError, WorkspaceGate } from "@/components/workspace-gate";
import { card, secondaryButton } from "@/components/ui";
import { formatMoney, isCurrency } from "@/lib/money";
import { useBusiness } from "@/lib/use-business";

export default function BusinessDashboard({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const valid = isAddress(address);
  const t = useTranslations("business");
  const locale = useLocale();
  const { data, run, busy, dashboard, error, reload } = useBusiness(valid ? address : "");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [createError, setCreateError] = useState<"limit" | "failed">();

  async function addRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || !dashboard || adding) return;
    const next = (dashboard.registers.at(-1)?.number ?? 0) + 1;
    setAdding(true);
    setCreateError(undefined);
    try {
      const response = await fetch(`/api/business/${address}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || t("defaultRegister", { number: next }) }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setCreateError(body?.error === "limit" ? "limit" : "failed");
        return;
      }
      setName("");
      await reload();
    } catch {
      setCreateError("failed");
    } finally {
      setAdding(false);
    }
  }

  if (!valid) {
    return (
      <main className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className={card}>{t("missing")}</p>
      </main>
    );
  }

  const index = dashboard?.derivationIndex ?? 0;
  const currency = dashboard && isCurrency(dashboard.currency) ? dashboard.currency : "USD";
  const money = (amount: string) => formatMoney(Number(amount), currency, locale);
  const dayLabel = (date: string) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", timeZone: "UTC" }).format(
      new Date(`${date}T00:00:00.000Z`),
    );

  return (
    <main className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">{dashboard?.name ?? t("title")}</h1>
        <p className="mt-1 text-muted">{dashboard ? t("place", { city: dashboard.city, currency }) : t("loading")}</p>
      </header>
      {dashboard ? <BusinessMenu address={address} index={index} current="panel" /> : null}
      <WorkspaceError code={error === "failed" ? "failed" : undefined} />
      {!data ? (
        <WorkspaceGate busy={busy} onConnect={() => void run("access")} />
      ) : error === "notMerchant" ? (
        <p className={card}>{t("notYours")}</p>
      ) : !dashboard ? (
        <p className="text-sm text-muted">{t("loading")}</p>
      ) : (
        <>
          <section className={`${card} grid grid-cols-2 gap-4`}>
            <div>
              <p className="text-sm text-muted">{t("weekSales")}</p>
              <p className="text-xl font-bold">{money(dashboard.weekSales)}</p>
            </div>
            <div>
              <p className="text-sm text-muted">{t("weekCustomers")}</p>
              <p className="text-xl font-bold">{dashboard.weekCustomers}</p>
            </div>
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t("registers")}</h2>
            <p className="text-sm text-muted">{t("registersHint")}</p>
            <form className="flex flex-col gap-3" onSubmit={(event) => void addRegister(event)}>
              <label className="flex flex-col gap-2 text-sm">
                {t("registerName")}
                <input
                  className="min-h-12 w-full rounded-card border border-elevated bg-surface px-4 py-3 text-text"
                  value={name}
                  maxLength={40}
                  placeholder={t("registerPlaceholder")}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <button className={secondaryButton} disabled={adding}>
                {t(adding ? "adding" : "addRegister")}
              </button>
              {createError ? (
                <p role="alert" className="text-sm text-error">
                  {t(createError === "limit" ? "registerLimit" : "registerFailed")}
                </p>
              ) : null}
            </form>
            {dashboard.registers.length === 0 ? <p className="text-sm text-muted">{t("noRegisters")}</p> : null}
            {dashboard.registers.map((register) => (
              <article key={register.id} className={`${card} flex flex-col gap-3`}>
                <header className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold">{register.name}</h3>
                  <p className="text-sm text-muted">
                    {t("registerWeek", { customers: register.weekCustomers, sales: money(register.weekSales) })}
                  </p>
                </header>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted">
                      <th className="py-1 font-medium">{t("day")}</th>
                      <th className="py-1 font-medium">{t("customers")}</th>
                      <th className="py-1 text-right font-medium">{t("sales")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {register.days.map((day) => (
                      <tr key={day.date} className="border-t border-elevated">
                        <td className="py-2">{dayLabel(day.date)}</td>
                        <td className="py-2">{day.customers}</td>
                        <td className="py-2 text-right">{money(day.sales)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
