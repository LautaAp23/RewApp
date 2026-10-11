"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { card, primaryButton, secondaryButton } from "@/components/ui";
import { useAccount } from "@/lib/account/account-context";
import { humanAccountError } from "@/lib/account/errors";
import { currencyForLanguageTag } from "@/lib/money";
import {
  MAX_EMAIL,
  MAX_NAME,
  type ProfileFormErrors,
  type ProfileFormValues,
  validateProfileForm,
} from "@/lib/profile-form";

const inputClass =
  "min-h-12 w-full min-w-0 rounded-card border border-elevated bg-background px-4 py-3 text-text placeholder:text-muted focus:border-primary focus:outline-2 focus:outline-primary disabled:opacity-50";

export default function RegisterPage() {
  const t = useTranslations("register");
  const tErrors = useTranslations("errors");
  const account = useAccount();
  const router = useRouter();
  const locale = useLocale();
  const [values, setValues] = useState<ProfileFormValues>({ name: "", email: "" });
  const [fieldErrors, setFieldErrors] = useState<ProfileFormErrors>({});
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const busy = saving || account.status === "busy";

  function update(field: keyof ProfileFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError(undefined);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const validation = validateProfileForm(values);
    setFieldErrors(validation);
    if (Object.keys(validation).length) {
      document.getElementById(`register-${Object.keys(validation)[0]}`)?.focus();
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      if (!(await account.createAccount())) return;
      const signed = await account.signProfile({
        alias: values.name.trim(),
        email: values.email.trim(),
        country: "",
        currency: currencyForLanguageTag(locale),
      });
      const response = await fetch(`/api/profile/${signed.address}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signed),
      });
      // The account already exists on the chain: a failed profile write must
      // never block entry. It can be completed later from the profile screen.
      if (!response.ok) console.warn("profile save failed", response.status);
      router.replace("/inicio");
    } catch (caught) {
      setError(tErrors(humanAccountError(caught)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted">{t("description")}</p>
      </header>
      <div className={`${card} text-sm text-muted`}>
        <p>{t("alreadyHaveAccount")}</p>
        <button
          type="button"
          className={`${secondaryButton} mt-3`}
          disabled={busy}
          onClick={() => void account.signIn()}
        >
          {t("signInInstead")}
        </button>
      </div>
      <form className="flex flex-col gap-6" onSubmit={submit} noValidate>
        <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
          <legend className="sr-only">{t("title")}</legend>
          <label className="flex flex-col gap-2" htmlFor="register-name">
            <span className="text-sm font-medium">{t("name")}</span>
            <input
              id="register-name"
              type="text"
              autoComplete="name"
              required
              maxLength={MAX_NAME}
              value={values.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder={t("namePlaceholder")}
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? "register-name-error" : undefined}
            />
            {fieldErrors.name ? (
              <span id="register-name-error" role="alert" className="text-sm text-error">
                {t("nameError")}
              </span>
            ) : null}
          </label>
          <label className="flex flex-col gap-2" htmlFor="register-email">
            <span className="text-sm font-medium">{t("email")}</span>
            <input
              id="register-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              maxLength={MAX_EMAIL}
              value={values.email}
              onChange={(event) => update("email", event.target.value)}
              placeholder={t("emailPlaceholder")}
              className={inputClass}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "register-email-error" : "register-email-hint"}
            />
            <span id="register-email-hint" className="text-xs text-muted">
              {t("emailHint")}
            </span>
            {fieldErrors.email ? (
              <span id="register-email-error" role="alert" className="text-sm text-error">
                {t("emailError")}
              </span>
            ) : null}
          </label>
        </fieldset>
        <p className="text-sm text-muted">{t("fingerprintNotice")}</p>
        {error ? (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        ) : null}
        <button type="submit" className={primaryButton} disabled={busy}>
          {t(busy ? "creating" : "create")}
        </button>
        <button type="button" className={secondaryButton} disabled={busy} onClick={() => router.replace("/")}>
          {t("back")}
        </button>
      </form>
    </main>
  );
}
