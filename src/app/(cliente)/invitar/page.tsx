"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { card, primaryButton, secondaryButton } from "@/components/ui";
import { useAccount } from "@/lib/account/account-context";
import { friendStatus, type ReferralsView } from "@/lib/api/referrals";
import { formatUsdr } from "@/lib/money";
import { useCurrency } from "@/lib/use-currency";
import { useFxRates } from "@/lib/use-fx";

export default function InvitePage() {
  const t = useTranslations("referral");
  const locale = useLocale();
  const { address, signReferralCode } = useAccount();
  const currency = useCurrency(address);
  const rates = useFxRates();
  const [view, setView] = useState<ReferralsView>();
  const [failed, setFailed] = useState(false);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setCanShare(typeof navigator.share === "function");
    setOrigin(window.location.origin);
  }, []);

  const load = useCallback(async () => {
    if (!address) return;
    setFailed(false);
    try {
      const response = await fetch(`/api/referrals/${address}`, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      let next = (await response.json()) as ReferralsView;
      if (!next.code) {
        const created = await fetch("/api/referrals/code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(await signReferralCode()),
        });
        if (created.status === 409) setNeedsProfile(true);
        else if (!created.ok) throw new Error(String(created.status));
        else next = { ...next, code: ((await created.json()) as { code: string }).code };
      }
      setView(next);
    } catch {
      setFailed(true);
    }
  }, [address, signReferralCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const program = view?.program;
  const points = (value: string) => Number(value).toLocaleString(locale);
  const link = view?.code && origin ? `${origin}/i/${view.code}` : "";

  async function share() {
    if (!program) return;
    try {
      await navigator.share({ title: "RewApp", text: t("shareText", { points: points(program.refereeBonus) }), url: link });
    } catch {}
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {}
  }

  return (
    <main className="flex flex-col gap-6" aria-busy={!view && !failed}>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        {program?.active ? (
          <p className="text-muted">
            {t("explain", {
              amount: formatUsdr(BigInt(program.minAmount), currency, rates, locale),
              referrerPoints: points(program.referrerBonus),
              refereePoints: points(program.refereeBonus),
            })}
          </p>
        ) : view ? (
          <p className="text-muted">{t("paused")}</p>
        ) : null}
      </header>

      {!view && !failed ? <p role="status" className="text-muted">{t("listLoading")}</p> : null}
      {failed ? (
        <div role="alert" className={`${card} flex flex-col gap-3`}>
          <p className="text-sm text-error">{t("loadError")}</p>
          <button className={secondaryButton} onClick={() => void load()}>{t("retry")}</button>
        </div>
      ) : null}
      {needsProfile ? (
        <div className={`${card} flex flex-col gap-3`}>
          <p className="text-sm">{t("profileRequired")}</p>
          <Link href="/perfil" className={secondaryButton}>{t("goToProfile")}</Link>
        </div>
      ) : null}

      {link ? (
        <section className={`${card} flex flex-col gap-3`}>
          <h2 className="text-lg font-semibold">{t("yourLink")}</h2>
          <p className="break-all select-all text-sm">{link}</p>
          {canShare && program?.active ? (
            <button className={primaryButton} onClick={() => void share()}>{t("share")}</button>
          ) : null}
          <button className={secondaryButton} onClick={() => void copy()}>{t(copied ? "copied" : "copy")}</button>
        </section>
      ) : null}

      {view ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("invitedTitle")}</h2>
          {BigInt(view.earned) > 0n ? (
            <p className="reward-points-badge font-semibold text-reward">{t("earned", { points: points(view.earned) })}</p>
          ) : null}
          {view.invited.length === 0 ? (
            <p className="text-sm text-muted">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-elevated">
              {view.invited.map((friend) => {
                const status = friendStatus(friend);
                return (
                  <li key={friend.id} className="flex min-h-14 items-center justify-between gap-3 py-3">
                    <span className="min-w-0 truncate font-semibold">{friend.alias ?? t("friend")}</span>
                    <span className={`shrink-0 text-sm ${status.key === "statusRewarded" ? "font-semibold text-reward" : "text-muted"}`}>
                      {status.points ? t(status.key, { points: points(status.points) }) : t(status.key)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </main>
  );
}
