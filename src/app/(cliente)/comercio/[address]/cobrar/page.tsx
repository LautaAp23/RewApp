"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, type FormEvent } from "react";
import { use } from "react";
import { getAddress, isAddress } from "viem";
import { BusinessMenu } from "@/components/business-menu";
import { NumericKeypad } from "@/components/numeric-keypad";
import { WorkspaceError, WorkspaceGate } from "@/components/workspace-gate";
import { card, primaryButton, secondaryButton } from "@/components/ui";
import { useAccount } from "@/lib/account/account-context";
import { humanAccountError } from "@/lib/account/errors";
import { currencyDigits, formatMoney, isCurrency, parseDecimal } from "@/lib/money";
import { isDerivationIndex } from "@/lib/merchant-index";
import { clearRegisterLock, writeRegisterLock } from "@/lib/register-lock";
import { useBusiness } from "@/lib/use-business";
import { useRegisterLock } from "@/lib/use-register-lock";

type Issued = { localAmount: string; expiresAt: string; qrDataUrl: string };

export default function ChargePage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const valid = isAddress(address);
  const t = useTranslations("business");
  const locale = useLocale();
  const account = useAccount();
  const router = useRouter();
  const lock = useRegisterLock();
  const { data, run, busy, dashboard, error } = useBusiness(valid ? address : "");
  const [registerId, setRegisterId] = useState("");
  const [amount, setAmount] = useState("");
  const [charging, setCharging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [failed, setFailed] = useState<"amount" | "failed">();
  const [leaveError, setLeaveError] = useState<"failed" | "passkey">();
  const [issued, setIssued] = useState<Issued>();
  const currency = dashboard && isCurrency(dashboard.currency) ? dashboard.currency : "USD";
  const decimals = currencyDigits(currency, locale);
  const separator = useMemo(
    () => new Intl.NumberFormat(locale).formatToParts(1.5).find((part) => part.type === "decimal")?.value ?? ".",
    [locale],
  );
  const lockedHere = Boolean(lock && valid && lock.merchant.toLowerCase() === address.toLowerCase());
  const index = lockedHere && lock && isDerivationIndex(lock.derivationIndex)
    ? lock.derivationIndex
    : isDerivationIndex(dashboard?.derivationIndex)
      ? dashboard.derivationIndex
      : 0;
  const selected = lockedHere && lock ? lock.registerId : registerId || dashboard?.registers[0]?.id || "";
  const openRegister = dashboard?.registers.find((register) => register.id === selected);

  function keepRegister() {
    if (!dashboard || !openRegister || !isDerivationIndex(index)) return;
    writeRegisterLock({
      merchant: getAddress(dashboard.address),
      registerId: openRegister.id,
      derivationIndex: index,
    });
  }

  async function leaveRegister() {
    if (leaving || busy) return;
    setLeaving(true);
    setLeaveError(undefined);
    try {
      await account.confirmPasskey();
      clearRegisterLock();
      router.replace(`/comercio/${address}`);
    } catch (caught) {
      setLeaveError(humanAccountError(caught) === "generic" ? "failed" : "passkey");
    } finally {
      setLeaving(false);
    }
  }

  async function charge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dashboard || !lockedHere || !selected || charging) return;
    const localAmount = amount.replace(/\.$/, "");
    try {
      if (parseDecimal(localAmount, 2) <= 0n) throw new Error();
    } catch {
      setFailed("amount");
      return;
    }
    setCharging(true);
    setFailed(undefined);
    setIssued(undefined);
    try {
      const response = await fetch("/api/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant: dashboard.address,
          localAmount,
          currency,
          registerId: selected,
        }),
      });
      if (!response.ok) throw new Error("failed");
      const created = (await response.json()) as Issued;
      if (!created.qrDataUrl) throw new Error("failed");
      setIssued(created);
      setAmount("");
    } catch {
      setFailed("failed");
    } finally {
      setCharging(false);
    }
  }

  if (!valid) {
    return (
      <main className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">{t("chargeTitle")}</h1>
        <p className={card}>{t("missing")}</p>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">{t("chargeTitle")}</h1>
        <p className="mt-1 text-muted">{dashboard ? t("chargeBody", { name: dashboard.name, currency }) : t("loading")}</p>
      </header>
      {dashboard && !lockedHere ? <BusinessMenu address={address} index={index} current="charge" /> : null}
      <WorkspaceError code={error === "failed" ? "failed" : undefined} />
      {!data ? (
        <WorkspaceGate busy={busy} onConnect={() => void run("access")} />
      ) : error === "notMerchant" ? (
        <p className={card}>{t("notYours")}</p>
      ) : !dashboard ? (
        <p className="text-sm text-muted">{t("loading")}</p>
      ) : lockedHere && !openRegister ? (
        <section className={`${card} flex flex-col gap-3`}>
          <p>{t("registerGone")}</p>
          <LeaveRegister leaving={leaving} error={leaveError} onLeave={() => void leaveRegister()} />
        </section>
      ) : dashboard.registers.length === 0 ? (
        <p className={card}>{t("needRegister")}</p>
      ) : !lockedHere ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            keepRegister();
          }}
        >
          <label className="flex flex-col gap-2 text-sm">
            {t("whichRegister")}
            <select
              className="min-h-12 w-full rounded-card border border-elevated bg-surface px-4 py-3 text-text"
              value={selected}
              onChange={(event) => setRegisterId(event.target.value)}
            >
              {dashboard.registers.map((register) => (
                <option key={register.id} value={register.id}>
                  {register.name}
                </option>
              ))}
            </select>
          </label>
          <button className={primaryButton}>{t("openRegister")}</button>
        </form>
      ) : issued ? (
        <section className={`${card} flex flex-col items-center gap-4 text-center`}>
          <p className="text-xl font-semibold">{formatMoney(Number(issued.localAmount), currency, locale)}</p>
          <Image
            src={issued.qrDataUrl}
            width={240}
            height={240}
            unoptimized
            alt={t("qrAlt")}
            className="h-auto w-full max-w-60 rounded-card"
          />
          <p className="text-sm text-muted">
            {t("expires", {
              time: new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(issued.expiresAt)),
            })}
          </p>
          <button className={primaryButton} onClick={() => setIssued(undefined)}>
            {t("anotherCharge")}
          </button>
        </section>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={(event) => void charge(event)}>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{t("lockedOn", { name: openRegister?.name ?? "" })}</h2>
            <p className="text-sm text-muted">{t("lockedHint")}</p>
          </div>
          <p className="text-center text-3xl font-bold">{formatMoney(Number(amount || "0"), currency, locale)}</p>
          <NumericKeypad value={amount} onChange={setAmount} decimals={decimals} separator={separator} />
          {failed ? (
            <p role="alert" className="text-sm text-error">
              {t(failed === "amount" ? "amountError" : "chargeFailed")}
            </p>
          ) : null}
          <button className={primaryButton} disabled={charging || busy || leaving}>
            {t(charging ? "charging" : "createQr")}
          </button>
        </form>
      )}
      {lockedHere && openRegister ? (
        <LeaveRegister leaving={leaving} error={leaveError} onLeave={() => void leaveRegister()} />
      ) : null}
    </main>
  );
}

function LeaveRegister({
  leaving,
  error,
  onLeave,
}: {
  leaving: boolean;
  error: "failed" | "passkey" | undefined;
  onLeave(): void;
}) {
  const t = useTranslations("business");
  const tErrors = useTranslations("errors");
  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="text-sm text-error">
          {error === "passkey" ? tErrors("passkeyFailed") : t("leaveFailed")}
        </p>
      ) : null}
      <button className={secondaryButton} disabled={leaving} onClick={onLeave}>
        {t(leaving ? "leavingRegister" : "leaveRegister")}
      </button>
    </div>
  );
}
