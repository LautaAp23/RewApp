"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PaymentMethodIcon } from "@/components/payment-method-icon";
import { card, primaryButton, secondaryButton } from "@/components/ui";
import { useAccount } from "@/lib/account/account-context";
import { humanAccountError } from "@/lib/account/errors";
import { cardReturnPath, DEMO_CARDS } from "@/lib/demo-cards";
import { useSavedCards } from "@/lib/use-saved-cards";
import { cardDigits, DEMO_CARD_NUMBERS, demoCardFromNumber, formatCardExpiry, formatCardNumber, validateCardForm, type CardFormErrors, type CardFormValues } from "@/lib/card-form";

const emptyValues: CardFormValues = { number: "", holder: "", expiry: "", securityCode: "" };
const inputClass = "min-h-12 w-full min-w-0 rounded-card border border-elevated bg-background px-4 py-3 text-text placeholder:text-muted focus:border-primary focus:outline-2 focus:outline-primary disabled:opacity-50";

function AddCard() {
  const t = useTranslations("addCard");
  const tCards = useTranslations("cardSelector");
  const tErrors = useTranslations("errors");
  const account = useAccount();
  const router = useRouter();
  const next = cardReturnPath(useSearchParams().get("next"));
  const saved = useSavedCards(account.address);
  const [values, setValues] = useState<CardFormValues>(emptyValues);
  const [fieldErrors, setFieldErrors] = useState<CardFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();
  const busy = submitting || account.status === "busy";
  const fixture = demoCardFromNumber(values.number);
  const exists = fixture && saved.cards.some((item) => item.brand === fixture.brand && item.last4 === fixture.last4 && item.funding === fixture.funding);

  function update(field: keyof CardFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError(undefined);
  }

  function fillDemo(index: number) {
    const year = String(new Date().getFullYear() + 2).slice(-2);
    setValues({ number: formatCardNumber(DEMO_CARD_NUMBERS[index]), holder: t("demoHolder"), expiry: `12/${year}`, securityCode: "123" });
    setFieldErrors({});
    setError(undefined);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || exists || saved.loading || saved.failed) return;
    const validation = validateCardForm(values);
    setFieldErrors(validation);
    if (Object.keys(validation).length || !fixture) {
      const first = Object.keys(validation)[0];
      document.getElementById(`card-${first}`)?.focus();
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      const proof = await account.signAddDemoCard(fixture.demoId);
      const response = await fetch("/api/demo-cards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(proof) });
      if (!response.ok) {
        if (response.status === 409) { setError(t("duplicate")); saved.reload(); return; }
        throw new Error("save failed");
      }
      setValues(emptyValues);
      setDone(true);
    } catch (caught) {
      setError(tErrors(humanAccountError(caught)));
    } finally {
      setValues((current) => ({ ...current, securityCode: "" }));
      setSubmitting(false);
    }
  }

  if (done) return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-on-primary" aria-hidden>
        <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
      </span>
      <h1 className="text-2xl font-semibold">{t("doneTitle")}</h1>
      <p className="text-muted">{t("doneBody")}</p>
      <button className={primaryButton} onClick={() => router.replace(next)}>{t(next.startsWith("/pagar/") ? "backToPay" : "viewCards")}</button>
    </main>
  );

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("description")}</p>
      </header>
      <div className={`${card} flex items-start gap-3`}>
        <span className="text-primary"><PaymentMethodIcon /></span>
        <p className="text-sm text-muted">{t("notice")}</p>
      </div>
      <div className={`${card} flex min-h-48 flex-col justify-between gap-6`} aria-hidden="true" data-card-preview>
        <div className="flex items-center justify-between gap-3"><PaymentMethodIcon /><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{tCards("demo")}</span></div>
        <p className="break-words text-lg font-medium tracking-wider tabular-nums sm:text-xl" data-preview-number>{values.number || t("previewNumber")}</p>
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1"><p className="text-xs text-muted">{t("holder")}</p><p className="mt-1 break-words text-sm font-medium uppercase" data-preview-holder>{values.holder.trim() || t("holderPlaceholder")}</p></div>
          <div className="shrink-0 text-right"><p className="text-xs text-muted">{t("expiry")}</p><p className="mt-1 text-sm font-medium tabular-nums" data-preview-expiry>{values.expiry || t("expiryPlaceholder")}</p></div>
        </div>
        <p className="text-xs text-muted">{fixture ? `${fixture.brand} · ${tCards(`funding.${fixture.funding}`)}` : t("previewBrand")}</p>
      </div>
      <form className="flex flex-col gap-6" onSubmit={submit} noValidate autoComplete="off">
        <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
          <legend className="sr-only">{t("details")}</legend>
          <label className="flex flex-col gap-2" htmlFor="card-number">
            <span className="text-sm font-medium">{t("number")}</span>
            <input id="card-number" name="demo-number" type="text" inputMode="numeric" autoComplete="off" spellCheck={false} required maxLength={23} value={values.number} onChange={(event) => update("number", formatCardNumber(event.target.value))} placeholder={t("numberPlaceholder")} className={inputClass} aria-invalid={Boolean(fieldErrors.number)} aria-describedby={fieldErrors.number ? "card-number-error" : "card-number-hint"} />
            <span id="card-number-hint" className="text-xs text-muted">{t("numberHint")}</span>
            {fieldErrors.number ? <span id="card-number-error" role="alert" className="text-sm text-error">{t(fieldErrors.number)}</span> : null}
          </label>
          <label className="flex flex-col gap-2" htmlFor="card-holder">
            <span className="text-sm font-medium">{t("holder")}</span>
            <input id="card-holder" name="demo-holder" type="text" autoComplete="off" required maxLength={80} value={values.holder} onChange={(event) => update("holder", event.target.value)} placeholder={t("holderPlaceholder")} className={inputClass} aria-invalid={Boolean(fieldErrors.holder)} aria-describedby={fieldErrors.holder ? "card-holder-error" : undefined} />
            {fieldErrors.holder ? <span id="card-holder-error" role="alert" className="text-sm text-error">{t(fieldErrors.holder)}</span> : null}
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex min-w-0 flex-col gap-2" htmlFor="card-expiry">
              <span className="text-sm font-medium">{t("expiry")}</span>
              <input id="card-expiry" name="demo-expiry" type="text" inputMode="numeric" autoComplete="off" required maxLength={5} value={values.expiry} onChange={(event) => update("expiry", formatCardExpiry(event.target.value))} placeholder={t("expiryPlaceholder")} className={inputClass} aria-invalid={Boolean(fieldErrors.expiry)} aria-describedby={fieldErrors.expiry ? "card-expiry-error" : undefined} />
              {fieldErrors.expiry ? <span id="card-expiry-error" role="alert" className="text-sm text-error">{t(fieldErrors.expiry)}</span> : null}
            </label>
            <label className="flex min-w-0 flex-col gap-2" htmlFor="card-securityCode">
              <span className="text-sm font-medium">{t("securityCode")}</span>
              <input id="card-securityCode" name="demo-security-code" type="password" inputMode="numeric" autoComplete="off" required maxLength={3} value={values.securityCode} onChange={(event) => update("securityCode", cardDigits(event.target.value).slice(0, 3))} placeholder={t("securityCodePlaceholder")} className={inputClass} aria-invalid={Boolean(fieldErrors.securityCode)} aria-describedby={fieldErrors.securityCode ? "card-securityCode-error" : undefined} />
              {fieldErrors.securityCode ? <span id="card-securityCode-error" role="alert" className="text-sm text-error">{t(fieldErrors.securityCode)}</span> : null}
            </label>
          </div>
        </fieldset>
        <details className={`${card} text-sm`}>
          <summary className="flex min-h-12 cursor-pointer items-center font-medium text-primary">{t("testData")}</summary>
          <p className="mb-3 text-muted">{t("testDataHint")}</p>
          <div className="flex flex-col gap-3">{DEMO_CARDS.map((item, index) => <button key={item.demoId} type="button" disabled={busy} className={`${secondaryButton} flex-col gap-1 text-sm`} onClick={() => fillDemo(index)}><span>{t("useDemo", { brand: item.brand, funding: tCards(`funding.${item.funding}`) })}</span><span className="font-normal tabular-nums text-muted">{formatCardNumber(DEMO_CARD_NUMBERS[index])}</span></button>)}</div>
        </details>
        <p className="text-sm text-muted">{t("confirmation")}</p>
        {saved.loading ? <p role="status" className="text-sm text-muted">{tCards("loading")}</p> : null}
        {saved.failed ? <div role="alert" className="flex flex-col gap-3"><p className="text-sm text-error">{tCards("loadError")}</p><button type="button" className={secondaryButton} onClick={saved.reload}>{tCards("retry")}</button></div> : null}
        {exists ? <p role="status" className="text-sm text-muted">{t("duplicate")}</p> : null}
        {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
        <button type="submit" className={primaryButton} disabled={busy || exists || saved.loading || saved.failed || !account.address}>{t(busy ? "saving" : "add")}</button>
        <button type="button" className={secondaryButton} disabled={busy} onClick={() => router.replace(next)}>{t("cancel")}</button>
      </form>
    </main>
  );
}

export default function AddCardPage() {
  return <Suspense><AddCard /></Suspense>;
}
