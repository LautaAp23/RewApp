"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { primaryButton, secondaryButton } from "@/components/ui";
import { useAccount } from "@/lib/account/account-context";
import { dismissBackup } from "@/lib/backup-prompt";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/inicio";
}

function Backup() {
  const t = useTranslations("backup");
  const tErrors = useTranslations("errors");
  const account = useAccount();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [done, setDone] = useState(false);
  const busy = account.status === "busy";

  if (done) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-4xl text-on-primary" aria-hidden>
          ✓
        </div>
        <h1 className="text-2xl font-bold">{t("doneTitle")}</h1>
        <p className="text-muted">{t("doneBody")}</p>
        <button className={primaryButton} onClick={() => router.replace(next)}>
          {t("continue")}
        </button>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col justify-center gap-5 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-surface text-primary" aria-hidden>
        <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" strokeLinejoin="round" />
          <path d="M8.5 12l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted">{t("body")}</p>
      <p className="text-sm text-muted">{t("hint")}</p>
      {account.error ? (
        <p role="alert" className="text-sm text-error">
          {tErrors(account.error)}
        </p>
      ) : null}
      <button
        className={primaryButton}
        disabled={busy}
        onClick={async () => {
          if (await account.addBackupPasskey()) setDone(true);
        }}
      >
        {busy ? t("waiting") : t("add")}
      </button>
      <button
        className={secondaryButton}
        disabled={busy}
        onClick={() => {
          if (account.address) dismissBackup(account.address);
          account.clearError();
          router.replace(next);
        }}
      >
        {t("later")}
      </button>
    </main>
  );
}

export default function BackupPage() {
  return (
    <Suspense>
      <Backup />
    </Suspense>
  );
}
