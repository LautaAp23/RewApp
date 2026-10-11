"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ConfirmIdentity } from "@/components/confirm-identity";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { card, primaryButton, secondaryButton } from "@/components/ui";
import { useAccount } from "@/lib/account/account-context";


export default function Home() {
  const t = useTranslations("landing");
  const tErrors = useTranslations("errors");
  const account = useAccount();
  const router = useRouter();
  const [confirmingCreate, setConfirmingCreate] = useState(false);
  const busy = account.status === "busy";
  // Keeps "Confirmá que sos vos" on screen while its passkey prompt is open.
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    if (account.status !== "signed-in") return;
    const next = new URLSearchParams(window.location.search).get("next");
    router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/inicio");
  }, [account.status, router]);

  useEffect(() => {
    if (account.status === "expired") setResuming(true);
    else if (account.status !== "busy") setResuming(false);
  }, [account.status]);

  if (account.status === "expired" || (resuming && busy)) {
    return <ConfirmIdentity />;
  }

  if (account.status === "signed-in") return null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <Image src="/icon-192.png" alt="" width={96} height={96} priority />
      <h1 className="text-[32px] font-bold">RewApp</h1>
      <p className="text-base text-muted">{t("tagline")}</p>

      {account.error ? (
        <div
          role="alert"
          className={`${card} flex w-full flex-col gap-3`}
        >
          <p className="text-sm text-error">{tErrors(account.error)}</p>
          <button
            className={primaryButton}
            disabled={busy}
            onClick={account.signIn}
          >
            {busy ? t("waiting") : t("retry")}
          </button>
          <button
            className={secondaryButton}
            disabled={busy}
            onClick={account.signIn}
          >
            {t("otherDevice")}
          </button>
          <p className="text-xs text-muted">{t("otherDeviceHint")}</p>
        </div>
      ) : confirmingCreate ? (
        <div className="flex w-full flex-col gap-3">
          <p className="text-sm text-muted">{t("createWarning")}</p>
          <button
            className={primaryButton}
            disabled={busy}
            onClick={account.createAccount}
          >
            {busy ? t("waiting") : t("createConfirm")}
          </button>
          <button
            className={secondaryButton}
            disabled={busy}
            onClick={() => setConfirmingCreate(false)}
          >
            {t("back")}
          </button>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-3">
          <button
            className={primaryButton}
            disabled={busy}
            onClick={account.signIn}
          >
            {busy ? t("waiting") : t("signIn")}
          </button>
          <button
            className={secondaryButton}
            disabled={busy}
            onClick={() => setConfirmingCreate(true)}
          >
            {t("createNew")}
          </button>
        </div>
      )}
      <LocaleSwitcher />
    </main>
  );
}
