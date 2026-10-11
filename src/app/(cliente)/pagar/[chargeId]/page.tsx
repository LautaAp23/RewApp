"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { FxNote } from "@/components/fx-note";
import { MerchantAvatar } from "@/components/merchant-avatar";
import { cardReward, primaryButton, secondaryButton } from "@/components/ui";
import { useAccount } from "@/lib/account/account-context";
import { humanAccountError } from "@/lib/account/errors";
import type { ChargeView } from "@/lib/api/charges";
import type { PayRequest, PayResponse, RelayErrorCode } from "@/lib/api/pay";
import { chainClient } from "@/lib/chain-client";
import { requireContractAddresses, rewAppPayAbi, usdrAbi } from "@/lib/contracts";
import { formatMoney, formatUsdr } from "@/lib/money";
import { useCurrency } from "@/lib/use-currency";
import { useFxRates } from "@/lib/use-fx";

const INTENT_TTL_SECONDS = 5n * 60n;

type PayError = "insufficientFunds" | "alreadyPaid" | "expired" | "overLimit" | "passkey" | "failed";

function payError(code: RelayErrorCode | undefined): PayError {
  switch (code) {
    case "insufficient_funds":
      return "insufficientFunds";
    case "already_paid":
      return "alreadyPaid";
    case "expired":
      return "expired";
    case "over_limit":
      return "overLimit";
    default:
      return "failed";
  }
}

function CheckBadge() {
  return (
    <div className="animate-pop flex h-24 w-24 items-center justify-center rounded-full bg-primary text-on-primary shadow-glow" aria-hidden>
      <svg className="h-12 w-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function PayPage() {
  const t = useTranslations("pay");
  const locale = useLocale();
  const { chargeId } = useParams<{ chargeId: string }>();
  const account = useAccount();
  const currency = useCurrency(account.address);
  const rates = useFxRates();
  const [charge, setCharge] = useState<ChargeView | null>();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<PayError>();
  const [paid, setPaid] = useState<PayResponse>();

  const latestLoad = useRef(0);

  const load = useCallback(async () => {
    const request = ++latestLoad.current;
    const query = new URLSearchParams({ currency });
    if (account.address) query.set("payer", account.address);
    let next: ChargeView | null = null;
    try {
      const response = await fetch(`/api/charges/${encodeURIComponent(chargeId)}?${query}`, { cache: "no-store" });
      if (response.ok) next = (await response.json()) as ChargeView;
    } catch {}
    if (request === latestLoad.current) setCharge(next);
  }, [chargeId, currency, account.address]);

  useEffect(() => {
    void load();
  }, [load]);

  const money = (usdr: string | bigint) => formatUsdr(BigInt(usdr), currency, rates, locale);
  const amountText = charge
    ? charge.payerAmount
      ? formatMoney(charge.payerAmount.amount, charge.payerAmount.currency, locale)
      : formatMoney(Number(charge.localAmount), charge.localCurrency, locale)
    : "";

  async function pay() {
    if (!charge || !account.address) return;
    setPaying(true);
    setError(undefined);
    try {
      const payer = account.address;
      const amount = BigInt(charge.usdAmount);
      const { usdr, rewAppPay } = requireContractAddresses();
      const [balance, nonce, permitNonce] = await Promise.all([
        chainClient.readContract({ address: usdr, abi: usdrAbi, functionName: "balanceOf", args: [payer] }),
        chainClient.readContract({ address: rewAppPay, abi: rewAppPayAbi, functionName: "nonces", args: [payer] }),
        chainClient.readContract({ address: usdr, abi: usdrAbi, functionName: "nonces", args: [payer] }),
      ]);
      if (balance < amount) {
        setError("insufficientFunds");
        return;
      }
      let signed;
      try {
        signed = await account.signPayment(
          {
            payer,
            merchant: charge.merchant.address,
            amount,
            chargeId: charge.chargeId,
            nonce,
            deadline: BigInt(Math.floor(Date.now() / 1000)) + INTENT_TTL_SECONDS,
          },
          permitNonce,
        );
      } catch (caught) {
        setError(humanAccountError(caught) === "generic" ? "failed" : "passkey");
        return;
      }
      const body: PayRequest = {
        charge: charge.id,
        intent: {
          payer: signed.intent.payer,
          merchant: signed.intent.merchant,
          amount: signed.intent.amount.toString(),
          chargeId: signed.intent.chargeId,
          nonce: signed.intent.nonce.toString(),
          deadline: signed.intent.deadline.toString(),
        },
        signature: signed.signature,
        permit: {
          value: signed.permit.value.toString(),
          deadline: signed.permit.deadline.toString(),
          v: signed.permit.v,
          r: signed.permit.r,
          s: signed.permit.s,
        },
      };
      const response = await fetch("/api/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => ({}))) as { error?: RelayErrorCode };
        setError(payError(failure.error));
        if (failure.error === "already_paid" || failure.error === "expired") void load();
        return;
      }
      setPaid((await response.json()) as PayResponse);
      navigator.vibrate?.([40, 60, 40]);
    } catch {
      setError("failed");
    } finally {
      setPaying(false);
    }
  }

  if (paid && charge) {
    const cashback = BigInt(paid.merchantReward);
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-5 text-center" aria-live="polite">
        <CheckBadge />
        <h1 className="text-2xl font-bold">{t("successTitle", { amount: amountText, merchant: charge.merchant.name })}</h1>
        {cashback > 0n ? (
          <p className="animate-rise text-lg font-semibold text-reward">
            {t("successCashback", { amount: money(cashback), merchant: charge.merchant.name })}
          </p>
        ) : null}
        {BigInt(paid.customerPoints) > 0n ? (
          <p className="animate-rise font-semibold text-reward">
            {t("successPoints", { points: Number(paid.customerPoints).toLocaleString(locale) })}
          </p>
        ) : null}
        <Link href="/inicio" className={primaryButton}>
          {t("done")}
        </Link>
      </main>
    );
  }

  if (charge === undefined) {
    return <main className="flex flex-1 items-center justify-center text-muted">{t("loading")}</main>;
  }

  if (charge === null || charge.status !== "PENDING") {
    const key = charge === null ? "notFound" : charge.status === "PAID" ? "alreadyPaid" : "expired";
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <h1 className="text-2xl font-bold">{t(`closed.${key}`)}</h1>
        <p className="text-muted">{t("closed.hint")}</p>
        <Link href="/escanear" className={primaryButton}>
          {t("scanAgain")}
        </Link>
        <Link href="/inicio" className={secondaryButton}>
          {t("backHome")}
        </Link>
      </main>
    );
  }

  const reward = charge.reward;
  const cashback = reward ? BigInt(reward.merchantReward) : 0n;
  const points = reward ? BigInt(reward.customerPoints) : 0n;
  const showsLocal = charge.payerAmount && charge.payerAmount.currency !== charge.localCurrency;

  return (
    <main className="flex flex-1 flex-col justify-center gap-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <MerchantAvatar name={charge.merchant.name} logoUrl={charge.merchant.logoUrl} size={72} />
        <p className="text-lg font-semibold">{charge.merchant.name}</p>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[40px] leading-tight font-bold">{amountText}</p>
        {showsLocal ? (
          <p className="text-sm text-muted">
            {formatMoney(Number(charge.localAmount), charge.localCurrency, locale)}
          </p>
        ) : null}
        <FxNote />
      </div>
      {cashback > 0n || points > 0n ? (
        <div className={`${cardReward} flex flex-col gap-1`}>
          {cashback > 0n ? (
            <p className="font-semibold text-reward">
              {t("rewardCashback", { amount: money(cashback), merchant: charge.merchant.name })}
            </p>
          ) : null}
          {points > 0n ? (
            <p className="text-sm text-reward">{t("rewardPoints", { points: Number(points).toLocaleString(locale) })}</p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="flex flex-col gap-2">
          <p className="text-sm text-error">{t(`errors.${error}`)}</p>
          {error === "insufficientFunds" ? (
            <Link href="/cargar" className="text-sm font-semibold text-primary">
              {t("topUp")}
            </Link>
          ) : null}
        </div>
      ) : null}
      <button className={primaryButton} disabled={paying || account.status === "busy"} onClick={() => void pay()}>
        {paying ? t("paying") : t("cta", { amount: amountText })}
      </button>
      <Link href="/inicio" className={secondaryButton}>
        {t("cancel")}
      </Link>
    </main>
  );
}
