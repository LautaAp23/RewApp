"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { CardSelector } from "@/components/card-selector";
import { DemoChargeTool } from "@/components/demo-charge-tool";
import { FxNote } from "@/components/fx-note";
import { MerchantAvatar } from "@/components/merchant-avatar";
import { card, cardReward, primaryButton, secondaryButton } from "@/components/ui";
import { useAccount } from "@/lib/account/account-context";
import type { ActivityMerchant } from "@/lib/api/activity";
import { hasBackup } from "@/lib/backup-prompt";
import { formatUsdr } from "@/lib/money";
import { useActivity } from "@/lib/use-activity";
import { useCurrency } from "@/lib/use-currency";
import { useFxRates } from "@/lib/use-fx";

function MerchantCard({ merchant }: { merchant: ActivityMerchant }) {
  const t = useTranslations("home");
  const goal = merchant.visitsGoal;
  const progress = goal ? merchant.visits % goal : 0;
  return (
    <li className={`${card} flex flex-col gap-3`}>
      <div className="flex items-center gap-3">
        <MerchantAvatar name={merchant.name} logoUrl={merchant.logoUrl} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{merchant.name}</p>
          <p className="text-sm text-muted">{t("visits", { count: merchant.visits })}</p>
        </div>
      </div>
      {goal ? (
        <>
          <div
            className="h-2 overflow-hidden rounded-full bg-elevated"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={progress}
          >
            <div className="h-full bg-reward" style={{ width: `${(progress / goal) * 100}%` }} />
          </div>
          <p className="text-sm text-reward">{t("visitsLeft", { count: goal - progress })}</p>
        </>
      ) : null}
    </li>
  );
}

export default function HomePage() {
  const t = useTranslations("home");
  const locale = useLocale();
  const account = useAccount();
  const currency = useCurrency(account.address);
  const rates = useFxRates();
  const { activity, failed, reload } = useActivity(account.address);
  const [backedUp, setBackedUp] = useState<boolean>();
  const [cardsOpen, setCardsOpen] = useState(false);

  useEffect(() => {
    if (window.location.hash !== "#tarjetas") return;
    setCardsOpen(true);
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  }, []);

  useEffect(() => {
    if (account.address) void hasBackup(account.address).then(setBackedUp);
  }, [account.address]);

  const money = (usdr: string) => formatUsdr(BigInt(usdr), currency, rates, locale);
  const date = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );
  const history = useMemo(() => {
    if (!activity) return [];
    return [
      ...activity.payments.map((p) => ({ id: p.id, at: p.createdAt, label: p.merchant.name, usdr: p.usdAmount, sign: "−" })),
      ...activity.topUps.map((u) => ({ id: u.id, at: u.createdAt, label: t("topUpEntry"), usdr: u.usdAmount, sign: "+" })),
    ].sort((a, b) => b.at.localeCompare(a.at));
  }, [activity, t]);

  const balance = activity?.balance;
  const unprotected = backedUp === false && balance !== null && balance !== undefined && BigInt(balance) > 0n;

  return (
    <main className="flex flex-col gap-6">
      <CardSelector open={cardsOpen} onClose={() => setCardsOpen(false)} addCardHref="/tarjetas/nueva?next=/inicio" />

      <section className="flex flex-col items-center gap-1 text-center" aria-live="polite">
        <p className="text-sm text-muted">{t("balance")}</p>
        <p className="text-[40px] leading-tight font-bold">{balance != null ? money(balance) : "—"}</p>
        <p className="font-semibold text-reward">
          {t("points", { points: activity?.points != null ? Number(activity.points).toLocaleString(locale) : "—" })}
        </p>
        <FxNote />
      </section>

      {failed ? (
        <div role="alert" className={`${card} flex flex-col gap-3`}>
          <p className="text-sm text-error">{t("loadError")}</p>
          <button className={secondaryButton} onClick={() => void reload()}>
            {t("retry")}
          </button>
        </div>
      ) : null}

      <Link href="/cargar" className={primaryButton}>
        {t("topUp")}
      </Link>
      {process.env.NODE_ENV === "development" ? <DemoChargeTool /> : null}

      {unprotected ? (
        <Link href="/respaldo?next=/inicio" className={`${cardReward} flex flex-col gap-1`}>
          <span className="font-semibold">{t("protectTitle")}</span>
          <span className="text-sm text-muted">{t("protectBody")}</span>
          <span className="text-sm font-semibold text-primary">{t("protectCta")}</span>
        </Link>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t("merchants")}</h2>
        {activity && activity.merchants.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {activity.merchants.map((merchant) => (
              <MerchantCard key={merchant.address} merchant={merchant} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t("noMerchants")}</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t("history")}</h2>
        {history.length > 0 ? (
          <ul className="flex flex-col divide-y divide-elevated">
            {history.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{entry.label}</p>
                  <p className="text-xs text-muted">{date.format(new Date(entry.at))}</p>
                </div>
                <p className={`shrink-0 font-semibold ${entry.sign === "+" ? "text-success" : "text-text"}`}>
                  {entry.sign} {money(entry.usdr)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t("noHistory")}</p>
        )}
      </section>
    </main>
  );
}
