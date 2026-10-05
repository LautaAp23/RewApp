"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useAccount } from "@/lib/account/account-context";

const primaryButton =
  "min-h-12 w-full rounded-button bg-primary px-6 py-3 font-bold text-on-primary active:bg-primary-pressed disabled:opacity-50";
const secondaryButton =
  "min-h-12 w-full rounded-button border border-elevated px-6 py-3 font-semibold text-text active:bg-surface disabled:opacity-50";

/** Shown when the session expired (15 min idle) or after a reload. */
export function ConfirmIdentity() {
  const t = useTranslations("session");
  const tErrors = useTranslations("errors");
  const account = useAccount();
  const busy = account.status === "busy";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <Image src="/icon-192.png" alt="" width={96} height={96} priority />
      <h1 className="text-[28px] font-bold">{t("confirmTitle")}</h1>
      <p className="text-base text-muted">{t("confirmBody")}</p>
      {account.error && (
        <p role="alert" className="text-sm text-error">
          {tErrors(account.error)}
        </p>
      )}
      <div className="flex w-full flex-col gap-3">
        <button
          className={primaryButton}
          disabled={busy}
          onClick={account.confirmIdentity}
        >
          {busy ? t("waiting") : t("confirm")}
        </button>
        <button
          className={secondaryButton}
          disabled={busy}
          onClick={account.endSession}
        >
          {t("otherAccount")}
        </button>
      </div>
    </main>
  );
}
