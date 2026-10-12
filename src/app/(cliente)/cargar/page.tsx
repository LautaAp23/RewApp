"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { TopUpSuccess } from "@/components/topup-success";
import { FxNote } from "@/components/fx-note";
import { NumericKeypad } from "@/components/numeric-keypad";
import { primaryButton, secondaryButton } from "@/components/ui";
import { useAccount } from "@/lib/account/account-context";
import { ONRAMP_MAX_USD } from "@/lib/api/onramp";
import { backupDismissed, hasBackup } from "@/lib/backup-prompt";
import { currencyDigits, formatMoney, formatUsdr } from "@/lib/money";
import { useCurrency } from "@/lib/use-currency";
import { useFxRates } from "@/lib/use-fx";

type ErrorKey = "rateLimited" | "outOfRange" | "failed" | "serviceUnavailable";

function errorKey(code: string | undefined): ErrorKey {
  if (code === "rate_limited") return "rateLimited";
  if (code === "amount_out_of_range") return "outOfRange";
  if (code === "service_unavailable") return "serviceUnavailable";
  return "failed";
}

export default function TopUpPage() {
  const t = useTranslations("topUp");
  const locale = useLocale();
  const router = useRouter();
  const account = useAccount();
  const currency = useCurrency(account.address);
  const rates = useFxRates();
  const submission = useRef(false);
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ErrorKey>();
  const [done, setDone] = useState<string>();

  // "Protección antes del primer depósito" (docs/PLAN.md §3).
  useEffect(() => {
    const address = account.address;
    if (!address || backupDismissed(address)) return;
    void hasBackup(address).then((backed) => {
      if (!backed) router.replace("/respaldo?next=/cargar");
    });
  }, [account.address, router]);

  const decimals = currencyDigits(currency, locale);
  const separator = useMemo(
    () =>
      new Intl.NumberFormat(locale)
        .formatToParts(1.5)
        .find((p) => p.type === "decimal")?.value ?? ".",
    [locale],
  );
  const value = Number(amount || "0");
  const formatted = formatMoney(value, currency, locale);

  async function submit() {
    if (!account.address || value <= 0 || submission.current) return;
    submission.current = true;
    setSending(true);
    setError(undefined);
    try {
      const response = await fetch("/api/onramp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: account.address,
          localAmount: amount.replace(/\.$/, ""),
          currency,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(errorKey(body.error));
        return;
      }
      setDone(formatted);
    } catch {
      setError("failed");
    } finally {
      submission.current = false;
      setSending(false);
    }
  }

  if (done) return <TopUpSuccess amount={done} />;

  return (
    <main className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p
        className="text-center text-[40px] leading-tight font-bold"
        aria-live="polite"
      >
        {formatted}
      </p>
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-xs text-muted">
          {t("limit", {
            amount: formatUsdr(ONRAMP_MAX_USD, currency, rates, locale),
          })}
        </p>
        <p className="text-xs text-muted">{t("simulated")}</p>
        <FxNote />
      </div>
      <fieldset
        disabled={sending}
        className="m-0 border-0 p-0 disabled:opacity-60"
      >
        <NumericKeypad
          value={amount}
          onChange={setAmount}
          decimals={decimals}
          separator={separator}
        />
      </fieldset>
      {error ? (
        <p role="alert" className="text-center text-sm text-error">
          {t(`errors.${error}`)}
        </p>
      ) : null}
      <button
        className={primaryButton}
        disabled={value <= 0 || sending}
        onClick={() => void submit()}
      >
        {sending ? (
          <span className="flex items-center justify-center gap-3">
            <svg
              className="topup-loading h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M20 12a8 8 0 1 1-8-8" strokeLinecap="round" />
            </svg>
            <span role="status">{t("loading")}</span>
          </span>
        ) : (
          t("cta", { amount: formatted })
        )}
      </button>
      <Link href="/inicio" className={secondaryButton}>
        {t("back")}
      </Link>
    </main>
  );
}
