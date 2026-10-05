"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { useAccount } from "@/lib/account/account-context";

const primaryButton =
  "min-h-12 w-full rounded-button bg-primary px-6 py-3 font-bold text-on-primary active:bg-primary-pressed disabled:opacity-50";
const secondaryButton =
  "min-h-12 w-full rounded-button border border-elevated px-6 py-3 font-semibold text-text active:bg-surface disabled:opacity-50";

export default function Home() {
  const t = useTranslations("landing");
  const tErrors = useTranslations("errors");
  const account = useAccount();
  const [confirmingCreate, setConfirmingCreate] = useState(false);
  const busy = account.status === "busy";

  if (account.status === "signed-in") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
        <Image src="/icon-192.png" alt="" width={96} height={96} priority />
        <h1 className="text-[32px] font-bold">{t("greeting")}</h1>
        <p className="text-base text-muted">{t("signedInBody")}</p>
        <button
          className={secondaryButton}
          onClick={() => {
            setConfirmingCreate(false);
            account.endSession();
          }}
        >
          {t("signOut")}
        </button>
        <LocaleSwitcher />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <Image src="/icon-192.png" alt="" width={96} height={96} priority />
      <h1 className="text-[32px] font-bold">RewApp</h1>
      <p className="text-base text-muted">{t("tagline")}</p>

      {account.error ? (
        <div
          role="alert"
          className="flex w-full flex-col gap-3 rounded-card border border-elevated bg-surface p-4"
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
