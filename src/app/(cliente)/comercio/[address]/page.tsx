"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { use } from "react";
import { isAddress } from "viem";
import { BusinessMenu } from "@/components/business-menu";
import { WorkspaceError, WorkspaceGate } from "@/components/workspace-gate";
import { card, secondaryButton } from "@/components/ui";
import { formatMoney, isCurrency, parseDecimal } from "@/lib/money";
import { WEEK_DAYS } from "@/lib/register-stats";
import type { DayStat } from "@/lib/register-stats";
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
  const [range, setRange] = useState<"week" | "history">("week");
  const [openHistory, setOpenHistory] = useState<string>();

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
    new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(`${date}T00:00:00.000Z`),
    );
  const axisDay = (date: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00.000Z`));
  const visibleDays = (days: DayStat[]) => (range === "week" ? days.slice(-WEEK_DAYS) : days);

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
          <section className={`${card} flex items-center justify-between gap-3`}>
            <div className="grid min-w-0 flex-1 gap-4">
              <div>
                <p className="text-sm text-muted">{t("weekSales")}</p>
                <p className="text-xl font-bold">{money(dashboard.weekSales)}</p>
              </div>
              <div>
                <p className="text-sm text-muted">{t("weekCustomers")}</p>
                <p className="text-xl font-bold">{dashboard.weekCustomers}</p>
              </div>
            </div>
            {dashboard.registers.length > 0 ? (
              <SalesChart days={visibleDays(dashboard.days)} money={money} axisDay={axisDay} dayLabel={dayLabel} />
            ) : null}
          </section>
          {dashboard.registers.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">{t("daily")}</h2>
              <p className="text-sm text-muted">{t("dailyHint")}</p>
              <div className="grid grid-cols-2 gap-2">
                {(["week", "history"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={range === option}
                    className={`pressable min-h-12 rounded-button px-3 text-sm font-semibold ${
                      range === option ? "gradient-primary text-on-primary" : "border border-elevated text-text"
                    }`}
                    onClick={() => setRange(option)}
                  >
                    {t(option === "week" ? "thisWeek" : "history")}
                  </button>
                ))}
              </div>
              <DayTable days={visibleDays(dashboard.days)} money={money} dayLabel={dayLabel} />
            </section>
          ) : null}
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
                <div className="flex items-center justify-between gap-3">
                  <header className="min-w-0">
                    <h3 className="truncate font-semibold">{register.name}</h3>
                    <p className="text-sm text-muted">
                      {t("registerWeek", { customers: register.weekCustomers, sales: money(register.weekSales) })}
                    </p>
                  </header>
                  <SalesChart days={visibleDays(register.days)} money={money} axisDay={axisDay} dayLabel={dayLabel} />
                </div>
                <button
                  type="button"
                  className="pressable min-h-12 text-left text-sm font-semibold text-accent"
                  aria-expanded={openHistory === register.id}
                  onClick={() => setOpenHistory(openHistory === register.id ? undefined : register.id)}
                >
                  {t(openHistory === register.id ? "hideDays" : "showDays")}
                </button>
                {openHistory === register.id ? (
                  <DayTable days={visibleDays(register.days)} money={money} dayLabel={dayLabel} />
                ) : null}
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}

function xLabelIndexes(count: number): number[] {
  if (count <= 1) return count === 1 ? [0] : [];
  if (count <= 7) return Array.from({ length: count }, (_, index) => index);
  const step = Math.ceil(count / 5);
  const indexes = Array.from({ length: count }, (_, index) => index).filter((index) => index % step === 0);
  const last = count - 1;
  if (indexes.at(-1) !== last) {
    if (last - indexes.at(-1)! < step) indexes[indexes.length - 1] = last;
    else indexes.push(last);
  }
  return indexes;
}

function SalesChart({
  days,
  money,
  axisDay,
  dayLabel,
}: {
  days: DayStat[];
  money(amount: string): string;
  axisDay(date: string): string;
  dayLabel(date: string): string;
}) {
  const t = useTranslations("business");
  const cents = days.map((day) => parseDecimal(day.sales, 2));
  const max = cents.reduce((highest, value) => (value > highest ? value : highest), 0n);
  const width = 248;
  const height = 136;
  const padL = 86;
  const padR = 10;
  const padT = 14;
  const padB = 24;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const yAt = (value: bigint) => {
    if (max === 0n) return padT + innerH;
    return padT + innerH - (Number((value * 10000n) / max) / 10000) * innerH;
  };
  const xAt = (index: number) => (days.length <= 1 ? padL + innerW / 2 : padL + (index / (days.length - 1)) * innerW);
  const labelIndexes = xLabelIndexes(days.length);
  const ticks = [...new Set((max === 0n ? [0n] : [max, max / 2n, 0n]).map(String))].map((value) => BigInt(value));
  const centsText = (value: bigint) => money(`${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`);
  const line = cents.map((value, index) => `${index === 0 ? "M" : "L"}${xAt(index).toFixed(1)},${yAt(value).toFixed(1)}`).join(" ");

  return (
    <figure className="w-[54%] shrink-0">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full" role="img" aria-label={t("salesPerDay")}>
        {ticks.map((tick) => {
          const y = yAt(tick);
          return (
            <g key={tick.toString()}>
              <line
                x1={padL}
                x2={width - padR}
                y1={y}
                y2={y}
                stroke="currentColor"
                className="text-muted"
                strokeOpacity="0.35"
              />
              <text x={padL - 6} y={y} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="currentColor" className="text-muted">
                {centsText(tick)}
              </text>
            </g>
          );
        })}
        <path d={line} fill="none" stroke="currentColor" className="text-accent" strokeWidth="2" strokeLinejoin="round" />
        {days.map((day, index) => (
          <circle key={day.date} cx={xAt(index)} cy={yAt(cents[index]!)} r={days.length > 14 ? 1.6 : 2.6} fill="currentColor" className="text-accent">
            <title>{`${dayLabel(day.date)}: ${money(day.sales)}`}</title>
          </circle>
        ))}
        {labelIndexes.map((index) => (
          <text key={days[index]!.date} x={xAt(index)} y={height - 6} textAnchor="middle" fontSize="11" fill="currentColor" className="text-muted">
            {axisDay(days[index]!.date)}
          </text>
        ))}
      </svg>
      <ul className="sr-only">
        {days.map((day) => (
          <li key={day.date}>
            {dayLabel(day.date)}: {money(day.sales)}
          </li>
        ))}
      </ul>
    </figure>
  );
}

function DayTable({
  days,
  money,
  dayLabel,
}: {
  days: DayStat[];
  money(amount: string): string;
  dayLabel(date: string): string;
}) {
  const t = useTranslations("business");
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted">
          <th className="py-1 font-medium">{t("day")}</th>
          <th className="py-1 font-medium">{t("customers")}</th>
          <th className="py-1 text-right font-medium">{t("sales")}</th>
        </tr>
      </thead>
      <tbody>
        {[...days].reverse().map((day) => (
          <tr key={day.date} className="border-t border-elevated">
            <td className="py-2">{dayLabel(day.date)}</td>
            <td className="py-2">{day.customers}</td>
            <td className="py-2 text-right">{money(day.sales)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
