"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PaymentMethodIcon } from "@/components/payment-method-icon";
import { card, primaryButton, secondaryButton } from "@/components/ui";
import { useAccount } from "@/lib/account/account-context";
import { humanAccountError } from "@/lib/account/errors";
import { cardReturnPath } from "@/lib/demo-cards";
import { CARD_BRANDS, validCardMetadata, validCardExpiryInput } from "@/lib/card-metadata";
import { formatCardExpiry } from "@/lib/card-form";

const empty = { brand: "Visa", last4: "", holder: "", expiry: "" };
const inputClass = "min-h-12 w-full min-w-0 rounded-card border border-elevated bg-background px-4 py-3 text-text focus:border-primary focus:outline-2 focus:outline-primary disabled:opacity-50";

function AddCard() {
  const t = useTranslations("addCard");
  const tErrors = useTranslations("errors");
  const account = useAccount();
  const router = useRouter();
  const next = cardReturnPath(useSearchParams().get("next"));
  const [values, setValues] = useState(empty);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();
  const [expiryError, setExpiryError] = useState(false);
  const busy = submitting || account.status === "busy";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !account.address) return;
    const metadata = { brand: values.brand, last4: values.last4, holder: values.holder.trim(), expiryMonth: Number(values.expiry.slice(0, 2)), expiryYear: 2000 + Number(values.expiry.slice(3)) };
    if (!validCardExpiryInput(values.expiry)) {
      setExpiryError(true);
      document.getElementById("card-expiry")?.focus();
      return;
    }
    if (!validCardMetadata(metadata)) { setError(t("invalidDetails")); return; }
    setSubmitting(true);
    setError(undefined);
    try {
      const proof = await account.signAddCard(metadata);
      const response = await fetch("/api/cards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(proof) });
      if (response.status === 409) { setError(t("duplicate")); return; }
      if (!response.ok) { setError(t("saveError")); return; }
      setValues(empty);
      setDone(true);
    } catch (caught) {
      setError(tErrors(humanAccountError(caught)));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-on-primary" aria-hidden><PaymentMethodIcon /></span>
      <h1 className="text-2xl font-semibold">{t("doneTitle")}</h1>
      <p className="text-muted">{t("doneBody")}</p>
      <button className={primaryButton} onClick={() => router.replace(next)}>{t(next.startsWith("/pagar/") ? "backToPay" : "viewCards")}</button>
    </main>
  );

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2"><h1 className="text-2xl font-semibold">{t("title")}</h1><p className="text-muted">{t("description")}</p></header>
      <div className={`${card} flex items-start gap-3`}><span className="text-primary"><PaymentMethodIcon /></span><p className="text-sm text-muted">{t("notice")}</p></div>
      <div className={`${card} flex min-h-48 flex-col justify-between gap-6`} aria-hidden="true" data-card-preview>
        <div className="flex items-center justify-between"><PaymentMethodIcon /><span>{values.brand === "Other" ? t("otherBrand") : values.brand}</span></div>
        <p className="text-lg font-medium tracking-wider tabular-nums" data-preview-number>•••• •••• •••• {values.last4 || "••••"}</p>
        <div className="flex items-end justify-between gap-4"><p className="break-words uppercase" data-preview-holder>{values.holder || t("holderPlaceholder")}</p><p className="shrink-0 tabular-nums" data-preview-expiry>{values.expiry || t("expiryPlaceholder")}</p></div>
      </div>
      <form className="flex flex-col gap-6" onSubmit={submit}>
        <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
          <legend className="sr-only">{t("details")}</legend>
          <label className="flex flex-col gap-2" htmlFor="card-brand"><span>{t("brand")}</span><select id="card-brand" className={inputClass} value={values.brand} onChange={(e) => setValues({ ...values, brand: e.target.value })}>{CARD_BRANDS.map((brand) => <option key={brand} value={brand}>{brand === "Other" ? t("otherBrand") : brand}</option>)}</select></label>
          <label className="flex flex-col gap-2" htmlFor="card-last4"><span>{t("last4")}</span><input id="card-last4" className={inputClass} type="text" inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" maxLength={4} required value={values.last4} onChange={(e) => setValues({ ...values, last4: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="0000" aria-describedby="card-number-hint" /><span id="card-number-hint" className="text-xs text-muted">{t("numberHint")}</span></label>
          <label className="flex flex-col gap-2" htmlFor="card-holder"><span>{t("holder")}</span><input id="card-holder" className={inputClass} type="text" autoComplete="cc-name" minLength={2} maxLength={80} required value={values.holder} onChange={(e) => setValues({ ...values, holder: e.target.value })} placeholder={t("holderPlaceholder")} /></label>
          <label className="flex flex-col gap-2" htmlFor="card-expiry">
            <span>{t("expiry")}</span>
            <input id="card-expiry" className={inputClass} type="text" inputMode="numeric" autoComplete="cc-exp" pattern="[0-9]{2}/[0-9]{2}" maxLength={5} required value={values.expiry}
              onChange={(e) => { setValues({ ...values, expiry: formatCardExpiry(e.target.value) }); setExpiryError(false); setError(undefined); }}
              onBlur={() => setExpiryError(!validCardExpiryInput(values.expiry))}
              aria-invalid={expiryError} aria-describedby={expiryError ? "card-expiry-error" : undefined} placeholder={t("expiryPlaceholder")} />
            {expiryError ? <span id="card-expiry-error" role="alert" className="text-sm text-error">{t("expiryError")}</span> : null}
          </label>
        </fieldset>
        <p className="text-sm text-muted">{t("confirmation")}</p>
        {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
        <button type="submit" className={primaryButton} disabled={busy || !account.address}>{t(busy ? "saving" : "add")}</button>
        <button type="button" className={secondaryButton} disabled={busy} onClick={() => router.replace(next)}>{t("cancel")}</button>
      </form>
    </main>
  );
}

export default function AddCardPage() { return <Suspense><AddCard /></Suspense>; }
