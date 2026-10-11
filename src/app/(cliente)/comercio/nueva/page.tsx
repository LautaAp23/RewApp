"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { card, primaryButton, secondaryButton } from "@/components/ui";
import { useAccount } from "@/lib/account/account-context";
import { humanAccountError } from "@/lib/account/errors";
import { chainClient } from "@/lib/chain-client";
import { requireContractAddresses, rewAppPayAbi } from "@/lib/contracts";
import { MERCHANT_CATEGORIES } from "@/lib/merchant-categories";
import {
  MERCHANT_LIMITS,
  type MerchantFormErrors,
  type MerchantFormValues,
  validateMerchantForm,
} from "@/lib/merchant-form";
import { currencyForCountry } from "@/lib/money";
import type { PlaceSuggestion } from "@/lib/places";

const inputClass =
  "min-h-12 w-full min-w-0 rounded-card border border-elevated bg-background px-4 py-3 text-text placeholder:text-muted focus:border-primary focus:outline-2 focus:outline-primary disabled:opacity-50";
const empty: MerchantFormValues = {
  name: "",
  category: "cafe",
  city: "",
  streetAddress: "",
  country: "",
  currency: "USD",
  email: "",
};

export default function NewMerchantPage() {
  const t = useTranslations("newMerchant");
  const tCategories = useTranslations("merchantCategories");
  const tErrors = useTranslations("errors");
  const account = useAccount();
  const router = useRouter();
  const [values, setValues] = useState<MerchantFormValues>(empty);
  const [place, setPlace] = useState<PlaceSuggestion>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [searchDown, setSearchDown] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<MerchantFormErrors>({});
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const busy = saving || account.status === "busy";

  // The search only autocompletes: it never gates the form.
  useEffect(() => {
    if (query.trim().length < 3) return setResults([]);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/places?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((data: { places: PlaceSuggestion[]; available: boolean }) => {
          setResults(data.places);
          setSearchDown(!data.available);
        })
        .catch(() => undefined);
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  function choose(suggestion: PlaceSuggestion) {
    setPlace(suggestion);
    setResults([]);
    setQuery(suggestion.name);
    setValues({
      name: suggestion.name,
      category: suggestion.category,
      city: suggestion.city,
      streetAddress: suggestion.streetAddress,
      country: suggestion.country,
      currency: suggestion.currency,
      email: values.email,
    });
    setFieldErrors({});
  }

  function update(field: keyof MerchantFormValues, value: string) {
    setValues((current) => ({
      ...current,
      [field]: value,
      // Typing the country by hand has to move the currency too: otherwise a
      // business in Argentina would end up charging in dollars by accident.
      ...(field === "country" && value.length === 2 ? { currency: currencyForCountry(value) } : {}),
    }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError(undefined);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const merchantAddress = account.merchantAddress;
    if (busy || !merchantAddress) return;
    const validation = validateMerchantForm(values);
    setFieldErrors(validation);
    if (Object.keys(validation).length) {
      document.getElementById(`merchant-${Object.keys(validation)[0]}`)?.focus();
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const { rewAppPay } = requireContractAddresses();
      const nonce = await chainClient.readContract({
        address: rewAppPay,
        abi: rewAppPayAbi,
        functionName: "nonces",
        args: [merchantAddress],
      });
      const signed = await account.signMerchantRegistration(
        {
          ...values,
          country: values.country.toUpperCase(),
          placeId: place?.placeId ?? "",
          lat: place ? String(place.lat) : "",
          lng: place ? String(place.lng) : "",
        },
        nonce,
      );
      const response = await fetch("/api/merchants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signed),
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => ({}))) as { error?: string };
        setError(
          t(
            failure.error === "merchant_exists"
              ? "alreadyRegistered"
              : failure.error === "person_address"
                ? "personAddress"
                : "activationFailed",
          ),
        );
        return;
      }
      setDone(true);
    } catch (caught) {
      setError(tErrors(humanAccountError(caught)));
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <h1 className="text-2xl font-semibold">{t("doneTitle")}</h1>
        <p className="text-muted">{t("doneBody")}</p>
        <button className={primaryButton} onClick={() => router.replace("/inicio")}>
          {t("doneCta")}
        </button>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("description")}</p>
      </header>
      <label className="flex flex-col gap-2" htmlFor="merchant-search">
        <span className="text-sm font-medium">{t("search")}</span>
        <input
          id="merchant-search"
          type="search"
          autoComplete="off"
          value={query}
          disabled={busy}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className={inputClass}
        />
        <span className="text-xs text-muted">{t(searchDown ? "searchDown" : "searchHint")}</span>
      </label>
      {results.length ? (
        <ul className="flex flex-col gap-2">
          {results.map((suggestion) => (
            <li key={suggestion.placeId}>
              <button type="button" className={`${card} w-full text-left`} onClick={() => choose(suggestion)}>
                <span className="block font-medium">{suggestion.name}</span>
                <span className="block text-sm text-muted">
                  {[suggestion.streetAddress, suggestion.city].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form className="flex flex-col gap-6" onSubmit={submit} noValidate>
        <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
          <legend className="sr-only">{t("details")}</legend>
          {(
            [
              ["name", "text", MERCHANT_LIMITS.name],
              ["city", "text", MERCHANT_LIMITS.city],
              ["streetAddress", "text", MERCHANT_LIMITS.streetAddress],
              ["email", "email", MERCHANT_LIMITS.email],
            ] as const
          ).map(([field, type, max]) => (
            <label key={field} className="flex flex-col gap-2" htmlFor={`merchant-${field}`}>
              <span className="text-sm font-medium">{t(field)}</span>
              <input
                id={`merchant-${field}`}
                type={type}
                autoComplete="off"
                maxLength={max}
                value={values[field]}
                onChange={(event) => update(field, event.target.value)}
                placeholder={t(`${field}Placeholder`)}
                className={inputClass}
                aria-invalid={Boolean(fieldErrors[field])}
                aria-describedby={fieldErrors[field] ? `merchant-${field}-error` : undefined}
              />
              {fieldErrors[field] ? (
                <span id={`merchant-${field}-error`} role="alert" className="text-sm text-error">
                  {t(`${field}Error`)}
                </span>
              ) : null}
            </label>
          ))}
          <label className="flex flex-col gap-2" htmlFor="merchant-category">
            <span className="text-sm font-medium">{t("category")}</span>
            <select
              id="merchant-category"
              value={values.category}
              className={inputClass}
              onChange={(event) => update("category", event.target.value)}
            >
              {MERCHANT_CATEGORIES.map((slug) => (
                <option key={slug} value={slug}>
                  {tCategories(slug)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2" htmlFor="merchant-country">
            <span className="text-sm font-medium">{t("country")}</span>
            <input
              id="merchant-country"
              type="text"
              maxLength={2}
              value={values.country}
              onChange={(event) => update("country", event.target.value.toUpperCase())}
              placeholder={t("countryPlaceholder")}
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.country)}
            />
            {fieldErrors.country ? (
              <span role="alert" className="text-sm text-error">
                {t("countryError")}
              </span>
            ) : null}
          </label>
        </fieldset>
        <p className="text-sm text-muted">{t("confirmation")}</p>
        {error ? (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        ) : null}
        <button type="submit" className={primaryButton} disabled={busy || !account.merchantAddress}>
          {t(busy ? "saving" : "submit")}
        </button>
        <button type="button" className={secondaryButton} disabled={busy} onClick={() => router.replace("/inicio")}>
          {t("cancel")}
        </button>
      </form>
    </main>
  );
}
