"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { card, cardReward } from "@/components/ui";
import type { ReferralsView } from "@/lib/api/referrals";
import { INVITE_CLAIMED_EVENT } from "@/lib/claim-invite";
import { type Currency, type FxRates, formatUsdr } from "@/lib/money";
import { readInvite, type SavedInvite } from "@/lib/referral-storage";

/** Home card: who invited you while your first payment is pending, otherwise an invitation to invite. */
export function InviteCard({ address, currency, rates }: { address: string; currency: Currency; rates: FxRates }) {
  const t = useTranslations("referral");
  const locale = useLocale();
  const [view, setView] = useState<ReferralsView | null>(null);
  // Right after sign-up the claim is still in flight: the saved invite already knows who invited.
  const [saved, setSaved] = useState<SavedInvite | null>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetch(`/api/referrals/${address}`, { cache: "no-store" })
        .then((response) => (response.ok ? (response.json() as Promise<ReferralsView>) : null))
        .then((next) => active && setView(next))
        .catch(() => undefined);
    setSaved(readInvite());
    void load();
    window.addEventListener(INVITE_CLAIMED_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(INVITE_CLAIMED_EVENT, load);
    };
  }, [address]);

  const program = view?.program;
  if (!view || !program?.active) return null;
  const points = (value: string) => Number(value).toLocaleString(locale);

  const invitedBy = view.myInvite ? (view.myInvite.status === "pending" ? view.myInvite : null) : saved;
  if (invitedBy) {
    return (
      <div className={`${cardReward} flex flex-col gap-1`}>
        <span className="font-semibold">
          {invitedBy.alias ? t("homeInvitedTitle", { name: invitedBy.alias }) : t("homeInvitedFriendTitle")}
        </span>
        <span className="text-sm text-muted">
          {t("homeInvitedBody", {
            amount: formatUsdr(BigInt(program.minAmount), currency, rates, locale),
            points: points(program.refereeBonus),
          })}
        </span>
      </div>
    );
  }
  return (
    <Link href="/invitar" className={`${card} pressable flex flex-col gap-1`}>
      <span className="font-semibold">{t("title")}</span>
      <span className="text-sm text-muted">
        {t("homeInviteBody", { referrerPoints: points(program.referrerBonus), refereePoints: points(program.refereeBonus) })}
      </span>
      <span className="text-sm font-semibold text-primary">{t("homeCta")}</span>
    </Link>
  );
}
