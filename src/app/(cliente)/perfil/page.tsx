"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { CardSelector } from "@/components/card-selector";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { card, primaryButton, secondaryButton } from "@/components/ui";
import { useAccount } from "@/lib/account/account-context";
import { accountCode } from "@/lib/account-code";
import { hasBackup } from "@/lib/backup-prompt";
import {
  CURRENCIES,
  COUNTRY_CURRENCY,
  isCurrency,
  type Currency,
} from "@/lib/money";
type Profile = {
  alias: string | null;
  country: string | null;
  currency: string;
  exists: boolean;
};
const input =
  "min-h-12 w-full rounded-card border border-elevated bg-surface px-4 py-3 text-text";
export default function Page() {
  const search = useSearchParams(),
    router = useRouter();
  const home = useTranslations("home");
  const t = useTranslations("profile"),
    locale = useLocale(),
    account = useAccount();
  const [profile, setProfile] = useState<Profile>(),
    [alias, setAlias] = useState(""),
    [country, setCountry] = useState(""),
    [currency, setCurrency] = useState<Currency>("USD"),
    [backup, setBackup] = useState<boolean>(),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(false),
    [saved, setSaved] = useState(false),
    [copied, setCopied] = useState(false),
    [cards, setCards] = useState(false),
    [merchant, setMerchant] = useState(false);
  const current = useRef(account.address);
  current.current = account.address;
  const load = useCallback(async () => {
    const address = account.address;
    if (!address) return;
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(`/api/profile/${address}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const value = (await response.json()) as Profile;
      if (current.current !== address) return;
      setProfile(value);
      setAlias(value.alias ?? "");
      setCountry(value.country ?? "");
      setCurrency(isCurrency(value.currency) ? value.currency : "USD");
      try {
        const protectedAccount = await hasBackup(address);
        if (current.current === address) setBackup(protectedAccount);
      } catch {
        setBackup(undefined);
      }
    } catch {
      if (current.current === address) setError(true);
    } finally {
      if (current.current === address) setLoading(false);
    }
  }, [account.address]);
  useEffect(() => {
    if (!account.address) return;
    let active = true;
    setMerchant(false);
    void fetch(`/api/navigation/${account.address}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((value) => {
        if (active) setMerchant(!!value?.merchant);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [account.address]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (search.get("tarjetas") === "1" || window.location.hash === "#tarjetas") setCards(true);
  }, [search]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!account.address || saving) return;
    const address = account.address;
    setSaving(true);
    setError(false);
    setSaved(false);
    try {
      const signed = await account.signProfileUpdate({
        alias,
        country,
        currency,
      });
      if (current.current !== address) return;
      const response = await fetch(`/api/profile/${address}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signed),
      });
      if (!response.ok) throw new Error();
      if (current.current === address) {
        const value = await response.json();
        setProfile({ ...value, exists: true });
        setAlias(value.alias ?? "");
        setSaved(true);
        window.dispatchEvent(new Event("rewapp:profile-updated"));
      }
    } catch {
      if (current.current === address) setError(true);
    } finally {
      setSaving(false);
    }
  }
  const regions = new Intl.DisplayNames([locale], { type: "region" });
  const countries = Array.from(
    new Set([...Object.keys(COUNTRY_CURRENCY), ...(country ? [country] : [])]),
  );
  const initials = (profile?.alias ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
  return (
    <main className="flex flex-col gap-7">
      <header className="flex items-center gap-4">
        <span
          aria-hidden
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-elevated text-xl font-semibold text-accent"
        >
          {initials || (
            <svg
              className="h-8 w-8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
            </svg>
          )}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="break-words text-muted">
            {profile?.alias || t("welcome")}
          </p>
        </div>
      </header>
      {error && (
        <div role="alert" className="flex flex-col gap-2">
          <p className="text-sm text-error">{t("error")}</p>
          <button
            className={secondaryButton}
            disabled={saving}
            onClick={() => void load()}
          >
            {t("retry")}
          </button>
        </div>
      )}
      {loading ? (
        <p role="status" className="text-muted">
          {t("loading")}
        </p>
      ) : (
        profile && (
          <form className="flex flex-col gap-4" onSubmit={save}>
            <h2 className="text-lg font-semibold">{t("details")}</h2>
            <label className="flex flex-col gap-2 text-sm">
              {t("name")}
              <input
                className={input}
                value={alias}
                maxLength={40}
                autoComplete="nickname"
                disabled={saving}
                onChange={(e) => {
                  setAlias(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm">
                {t("country")}
                <select
                  className={input}
                  value={country}
                  disabled={saving}
                  onChange={(e) => {
                    setCountry(e.target.value);
                    setSaved(false);
                  }}
                >
                  <option value="">{t("noCountry")}</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>
                      {regions.of(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm">
                {t("currency")}
                <select
                  className={input}
                  value={currency}
                  disabled={saving}
                  onChange={(e) => {
                    if (isCurrency(e.target.value)) setCurrency(e.target.value);
                    setSaved(false);
                  }}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-sm text-muted">{t("confirmation")}</p>
            <button
              className={primaryButton}
              disabled={
                saving ||
                (alias.trim() === (profile.alias ?? "") &&
                  country === (profile.country ?? "") &&
                  currency === profile.currency)
              }
            >
              {t(saving ? "saving" : "save")}
            </button>
            {saved && (
              <p role="status" className="text-sm text-success">
                {t("saved")}
              </p>
            )}
          </form>
        )
      )}
      <section className={`${card} flex flex-col gap-3`}>
        <h2 className="text-lg font-semibold">{t("code")}</h2>
        <p className="text-sm text-muted">{t("codeHint")}</p>
        <p className="break-all select-all text-sm">
          {account.address ? accountCode(account.address) : "—"}
        </p>
        <button
          className={secondaryButton}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                accountCode(account.address!),
              );
              setCopied(true);
            } catch {
              setError(true);
            }
          }}
        >
          {t(copied ? "copied" : "copy")}
        </button>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("preferences")}</h2>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">{t("language")}</span>
          <LocaleSwitcher />
        </div>
        <button
          id="tarjetas"
          className={secondaryButton}
          aria-haspopup="dialog"
          onClick={() => setCards(true)}
        >
          {t("cards")}
        </button>
      </section>
      {account.roles?.merchant && (
        <p className="text-sm text-muted">
          {home("yourMerchant", { name: account.roles.merchant.name })}
        </p>
      )}
      {!merchant && !account.roles?.merchant && (
        <Link href="/comercio/nueva" className={secondaryButton}>
          {home("registerMerchant")}
        </Link>
      )}
      {merchant && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("merchant")}</h2>
          <Link href="/comercio/recompensas" className={secondaryButton}>
            {t("manageRewards")}
          </Link>
        </section>
      )}
      <section className={`${card} flex flex-col gap-3`}>
        <h2 className="text-lg font-semibold">{t("security")}</h2>
        <p className={`text-sm ${backup ? "text-success" : "text-muted"}`}>
          {t(
            backup === undefined
              ? "backupUnknown"
              : backup
                ? "backupReady"
                : "backupMissing",
          )}
        </p>
        <p className="text-sm text-muted">{t("securityHint")}</p>
        <Link href="/respaldo" className={secondaryButton}>
          {t("backup")}
        </Link>
      </section>
      <button
        className="pressable min-h-12 rounded-button border border-elevated px-6 font-semibold text-error hover:bg-surface"
        disabled={saving}
        onClick={account.endSession}
      >
        {t("signOut")}
      </button>
      <CardSelector
        open={cards}
        onClose={() => {
          setCards(false);
          if (search.get("tarjetas") === "1")
            router.replace("/perfil", { scroll: false });
          if (window.location.hash === "#tarjetas")
            window.history.replaceState(
              window.history.state,
              "",
              window.location.pathname,
            );
        }}
        addCardHref="/tarjetas/nueva?next=/inicio"
      />
    </main>
  );
}
