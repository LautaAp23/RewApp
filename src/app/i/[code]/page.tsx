"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { card, primaryButton, secondaryButton } from "@/components/ui";
import { useAccount } from "@/lib/account/account-context";
import type { ReferralCodeView } from "@/lib/api/referrals";
import { currencyForLanguageTag, formatUsdr } from "@/lib/money";
import { saveInvite } from "@/lib/referral-storage";
import { useFxRates } from "@/lib/use-fx";

/** Public landing of an invite link. Someone already signed in just goes home: v1 applies codes at sign-up. */
export default function InviteLandingPage() {
  const t = useTranslations("referral");
  const locale = useLocale();
  const rates = useFxRates();
  const account = useAccount();
  const router = useRouter();
  const { code } = useParams<{ code: string }>();
  const [invite, setInvite] = useState<ReferralCodeView | null>();
  const signedIn = account.status === "signed-in" || account.status === "expired";

  useEffect(() => {
    if (account.ready && signedIn) router.replace("/inicio");
  }, [account.ready, signedIn, router]);

  useEffect(() => {
    let active = true;
    fetch(`/api/referrals/code/${encodeURIComponent(code)}`, { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<ReferralCodeView>) : null))
      .then((view) => active && setInvite(view))
      .catch(() => active && setInvite(null));
    return () => {
      active = false;
    };
  }, [code]);

  useEffect(() => {
    if (invite && account.ready && !signedIn) saveInvite(invite.code, invite.alias);
  }, [invite, account.ready, signedIn]);

  if (!account.ready || signedIn) return null;
  if (invite === undefined) {
    return <main className="flex min-h-dvh items-center justify-center p-6 text-muted">{t("loading")}</main>;
  }
  if (invite === null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-bold">{t("notFoundTitle")}</h1>
        <p className="text-muted">{t("notFoundBody")}</p>
        <button className={primaryButton} onClick={() => router.replace("/")}>
          {t("goHome")}
        </button>
      </main>
    );
  }
  const program = invite.program;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <Image src="/icon-192.png" alt="" width={96} height={96} priority />
      <h1 className="text-2xl font-bold">
        {invite.alias ? t("invitedBy", { name: invite.alias }) : t("invitedByFriend")}
      </h1>
      {program?.active ? (
        <p className={`${card} text-base`}>
          {t("landingBonus", {
            points: Number(program.refereeBonus).toLocaleString(locale),
            amount: formatUsdr(BigInt(program.minAmount), currencyForLanguageTag(locale), rates, locale),
          })}
        </p>
      ) : null}
      <div className="flex w-full flex-col gap-3">
        <button className={primaryButton} onClick={() => router.push("/registro")}>
          {t("create")}
        </button>
        <button className={secondaryButton} disabled={account.status === "busy"} onClick={account.signIn}>
          {t("signIn")}
        </button>
      </div>
    </main>
  );
}
