"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/lib/account/account-context";
import { humanAccountError } from "@/lib/account/errors";
import type { RelayErrorCode, StreakClaimRequest, StreakClaimResponse } from "@/lib/api/pay";
import { chainClient } from "@/lib/chain-client";
import { requireContractAddresses, rewAppPayAbi } from "@/lib/contracts";
import { formatUsdr } from "@/lib/money";
import { STREAK_DAYS, STREAK_POTS, type Streak } from "@/lib/streak";
import { useCurrency } from "@/lib/use-currency";
import { useFxRates } from "@/lib/use-fx";
import { playCoins, unlockAudio, useStreakSound } from "@/lib/use-streak-sound";
import { StreakCelebration } from "./streak-celebration";
import { card, cardReward, primaryButton } from "./ui";

/** 1 USDr, the smallest payment that moves the streak (RewAppPay.MIN_STREAK_AMOUNT). */
const MIN_STREAK_AMOUNT = 1_000_000n;

type ClaimError = "passkey" | "alreadyClaimed" | "serviceUnavailable" | "failed";

function claimError(code: RelayErrorCode | undefined): ClaimError {
  if (code === "streak_not_claimable") return "alreadyClaimed";
  if (code === "service_unavailable") return "serviceUnavailable";
  return "failed";
}

function Flame({ lit, today }: { lit: boolean; today: boolean }) {
  return (
    <svg
      viewBox="0 0 24 32"
      aria-hidden
      className={`h-9 w-7 ${lit ? "streak-flame-lit text-reward" : "text-muted opacity-30"} ${today ? "streak-flame-today" : ""}`}
    >
      <path
        fill="currentColor"
        d="M12 1c1 5.5 6.5 8.4 8.6 13.3 2.4 5.7-1.2 15.7-8.6 15.7S1 23.2 3.2 17.2c1-2.8 3-4.4 4-6.8.6 2.4 1.7 3.6 3 4.1C9.6 10 10.6 5.3 12 1Z"
      />
      {lit ? <path fill="var(--color-background)" opacity=".35" d="M12 16c.6 2.8 3.6 4.1 3.6 7.2 0 2.5-1.6 4.3-3.6 4.3s-3.6-1.7-3.6-4c0-2.6 2.5-4 3.6-7.5Z" /> : null}
    </svg>
  );
}

function useHoursLeft(until: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [until]);
  return until ? Math.max(1, Math.ceil((new Date(until).getTime() - now) / 3_600_000)) : 0;
}

/** Global streak: 5 flames, the pot and, on 5/5, the claim. Home and payment success. */
export function StreakCard({ streak, onClaimed }: { streak: Streak; onClaimed?: () => void }) {
  const t = useTranslations("streak");
  const locale = useLocale();
  const account = useAccount();
  const currency = useCurrency(account.address);
  const rates = useFxRates();
  const [sound] = useStreakSound(account.address);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ClaimError>();
  const [celebrating, setCelebrating] = useState<number>();
  const lock = useRef(false);
  const hoursLeft = useHoursLeft(streak.rescueEndsAt);

  const { status, cycleDay, pot, nextPot, paidToday } = streak;
  const points = (value: number) => value.toLocaleString(locale);

  async function claim() {
    if (!account.address || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    if (sound) unlockAudio();
    try {
      const { rewAppPay } = requireContractAddresses();
      const nonce = await chainClient.readContract({
        address: rewAppPay,
        abi: rewAppPayAbi,
        functionName: "nonces",
        args: [account.address],
      });
      let signed;
      try {
        signed = await account.signStreakClaim(nonce);
      } catch (caught) {
        setError(humanAccountError(caught) === "generic" ? "failed" : "passkey");
        return;
      }
      const body: StreakClaimRequest = {
        intent: {
          account: signed.intent.account,
          nonce: signed.intent.nonce.toString(),
          deadline: signed.intent.deadline.toString(),
        },
        signature: signed.signature,
      };
      const response = await fetch("/api/streak/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => ({}))) as { error?: RelayErrorCode };
        setError(claimError(failure.error));
        if (failure.error === "streak_not_claimable") onClaimed?.();
        return;
      }
      const result = (await response.json()) as StreakClaimResponse;
      setCelebrating(Number(result.points) || STREAK_POTS[STREAK_DAYS]);
      if (sound) playCoins();
      navigator.vibrate?.([30, 40, 30, 40, 70]);
      onClaimed?.();
    } catch {
      setError("failed");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const title =
    status === "claimable" ? t("claimableTitle")
    : status === "at_risk" ? t("atRiskTitle")
    : status === "broken" ? t("brokenTitle")
    : cycleDay === 0 ? t(paidToday ? "claimedTitle" : "startTitle")
    : t(status === "active" ? "activeTitle" : "pendingTitle", { day: cycleDay, total: STREAK_DAYS });

  const body =
    status === "claimable" ? t("claimableBody", { points: points(pot) })
    : status === "at_risk"
      ? t(hoursLeft > 24 ? "atRiskBodyDays" : "atRiskBodyHours", {
          points: points(pot),
          count: hoursLeft > 24 ? Math.ceil(hoursLeft / 24) : hoursLeft,
        })
    : status === "broken" ? t("brokenBody")
    : cycleDay === 0 ? t(paidToday ? "claimedBody" : "startBody", { points: points(STREAK_POTS[STREAK_DAYS]) })
    : t(status === "active" ? "activeBody" : "pendingBody", { points: points(nextPot) });

  return (
    <section className={`${status === "claimable" ? cardReward : card} flex flex-col gap-4`} aria-labelledby="streak-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="streak-title" className="text-lg font-bold">{t("title")}</h2>
        <span className="rounded-full bg-elevated px-3 py-1 text-sm font-semibold text-reward">
          {t("pot", { points: points(pot) })}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <ol className="flex items-end justify-between px-1" aria-hidden>
          {Array.from({ length: STREAK_DAYS }, (_, i) => (
            <li key={i} className="flex flex-col items-center gap-1">
              <Flame lit={i < cycleDay} today={paidToday && i === cycleDay - 1} />
              <span className={`text-xs ${i < cycleDay ? "text-reward" : "text-muted"}`}>+{STREAK_POTS[i + 1] - STREAK_POTS[i]}</span>
            </li>
          ))}
        </ol>
        <div
          className="h-2 overflow-hidden rounded-full bg-elevated"
          role="progressbar"
          aria-label={t("progress", { day: cycleDay, total: STREAK_DAYS })}
          aria-valuemin={0}
          aria-valuemax={STREAK_DAYS}
          aria-valuenow={cycleDay}
        >
          <div className="animate-grow transition-fluid h-full bg-reward" style={{ width: `${(cycleDay / STREAK_DAYS) * 100}%` }} />
        </div>
      </div>

      <div className="flex flex-col gap-1" aria-live="polite">
        <p className={`font-semibold ${status === "at_risk" || status === "broken" ? "text-error" : "text-text"}`}>{title}</p>
        <p className="text-sm text-muted">{body}</p>
      </div>

      {status === "claimable" ? (
        <button className={primaryButton} disabled={busy || account.status === "busy"} onClick={() => void claim()}>
          {busy ? t("claiming") : t("claim", { points: points(pot) })}
        </button>
      ) : (
        <p className="text-xs text-muted">{t("rule", { amount: formatUsdr(MIN_STREAK_AMOUNT, currency, rates, locale) })}</p>
      )}
      {error ? <p role="alert" className="text-sm text-error">{t(`errors.${error}`)}</p> : null}

      {celebrating !== undefined ? <StreakCelebration points={celebrating} onClose={() => setCelebrating(undefined)} /> : null}
    </section>
  );
}
