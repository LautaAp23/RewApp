"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { CardSelector } from "@/components/card-selector";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { MyBusinesses } from "@/components/my-businesses";
import { Skeleton } from "@/components/skeleton";
import { StreakSoundToggle } from "@/components/streak-sound-toggle";
import { card, primaryButton, secondaryButton } from "@/components/ui";
import { useAccount } from "@/lib/account/account-context";
import { accountCode } from "@/lib/account-code";
import { hasBackup } from "@/lib/backup-prompt";
import {
  CURRENCIES,
  COUNTRY_CURRENCY,
  isCurrency,
  currencyName,
  type Currency,
} from "@/lib/money";
type Profile = {
  alias: string | null;
  handle?: string | null;
  country: string | null;
  currency: string;
  birthDay: number | null;
  birthMonth: number | null;
  exists: boolean;
};
const input =
  "min-h-12 w-full rounded-card border border-elevated bg-surface px-4 py-3 text-text";
export default function Page() {
  const search = useSearchParams(),
    router = useRouter();
  const t = useTranslations("profile"),
    locale = useLocale(),
    account = useAccount();
  const [profile, setProfile] = useState<Profile>(),
    [alias, setAlias] = useState(""),
    [country, setCountry] = useState(""),
    [currency, setCurrency] = useState<Currency>("USD"),
    [birthDay, setBirthDay] = useState(""),
    [birthMonth, setBirthMonth] = useState(""),
    [backup, setBackup] = useState<boolean>(),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(false),
    [locked, setLocked] = useState(false),
    [saved, setSaved] = useState(false),
    [editing, setEditing] = useState(false),
    [copied, setCopied] = useState(false),
    [cards, setCards] = useState(false);
  const personal = useTranslations("personal");
  const current = useRef(account.address);
  const nameInput = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  current.current = account.address;
  const load = useCallback(async () => {
    const address = account.address;
    if (!address) return;
    setLoading(true);
    setEditing(false);
    setSaved(false);
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
      setBirthDay(value.birthDay ? String(value.birthDay) : "");
      setBirthMonth(value.birthMonth ? String(value.birthMonth) : "");
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
    void load();
  }, [load]);
  useEffect(() => {
    if (editing) nameInput.current?.focus({ preventScroll: true });
    else if (wasEditing.current) editButton.current?.focus({ preventScroll: true });
    wasEditing.current = editing;
  }, [editing]);
  useEffect(() => {
    if (search.get("tarjetas") === "1" || window.location.hash === "#tarjetas") setCards(true);
  }, [search]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!account.address || saving || !editing) return;
    const address = account.address;
    setSaving(true);
    setError(false);
    setLocked(false);
    setSaved(false);
    try {
      const signed = await account.signProfileUpdate({
        alias,
        country,
        currency,
        birthDay,
        birthMonth,
      });
      if (current.current !== address) return;
      const response = await fetch(`/api/profile/${address}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signed),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (response.status === 409 && result?.error === "birthdate_locked") {
          if (current.current === address) setLocked(true);
          return;
        }
        throw new Error();
      }
      if (current.current === address) {
        const value = await response.json();
        setProfile(previous => ({ ...previous, ...value, exists: true }));
        setAlias(value.alias ?? "");
        setCountry(value.country ?? "");
        setCurrency(isCurrency(value.currency) ? value.currency : "USD");
        setBirthDay(value.birthDay ? String(value.birthDay) : "");
        setBirthMonth(value.birthMonth ? String(value.birthMonth) : "");
        setSaved(true);
        setEditing(false);
        window.dispatchEvent(new Event("rewapp:profile-updated"));
      }
    } catch {
      if (current.current === address) setError(true);
    } finally {
      setSaving(false);
    }
  }
  const regions = new Intl.DisplayNames([locale], { type: "region" });
  const monthName = (month: number) =>
    new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2026, month - 1, 1));
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
  const birthdayLocked = profile?.birthDay != null && profile?.birthMonth != null;
  function cancelEdit() {
    if (!profile || saving) return;
    setAlias(profile.alias ?? "");
    setCountry(profile.country ?? "");
    setCurrency(isCurrency(profile.currency) ? profile.currency : "USD");
    setBirthDay(profile.birthDay ? String(profile.birthDay) : "");
    setBirthMonth(profile.birthMonth ? String(profile.birthMonth) : "");
    setError(false);
    setLocked(false);
    setSaved(false);
    setEditing(false);
  }
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
        <div aria-busy="true" className="flex flex-col gap-4">
          <p role="status" className="sr-only">
            {t("loading")}
          </p>
          <div aria-hidden className="flex flex-col gap-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-12 w-full" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      ) : (
        profile && (
          !editing ? <section className={`${card} flex flex-col gap-5`}>
            <h2 className="text-lg font-semibold">{t("details")}</h2>
            <dl className="flex flex-col divide-y divide-elevated">
              {[
                { label: t("name"), value: profile.alias || t("notProvided") },
                { label: personal("alias"), value: profile.handle ? "@" + profile.handle : t("notProvided") },
                { label: t("country"), value: profile.country ? regions.of(profile.country) : t("noCountry") },
                { label: t("currency"), value: isCurrency(profile.currency) ? currencyName(profile.currency, locale) : profile.currency },
                { label: t("birthday"), value: birthdayLocked ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, profile.birthMonth! - 1, profile.birthDay!))) : t("notProvided") },
              ].map((row) => <div key={row.label} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <dt className="text-sm text-muted">{row.label}</dt>
                <dd className="break-words font-medium">{row.value}</dd>
              </div>)}
            </dl>
            <Link href="/amigos#alias" className="pressable min-h-11 content-center text-sm font-semibold text-accent">{personal("manageAlias")}</Link>
            <button ref={editButton} type="button" className={`${secondaryButton} gap-2`} onClick={() => { setSaved(false); setError(false); setLocked(false); setEditing(true); }}>
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m16 3 5 5M4 20l4-1L21 6a2 2 0 0 0-5-3L3 16l-1 6z" /></svg>
              {t("edit")}
            </button>
            {saved ? <p role="status" className="text-sm text-success">{t("saved")}</p> : null}
          </section> :
          <form className="flex flex-col gap-4" onSubmit={save}>
            <h2 className="text-lg font-semibold">{t("details")}</h2>
            <label className="flex flex-col gap-2 text-sm">
              {t("name")}
              <input
                ref={nameInput}
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
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm">{t("birthday")}</legend>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-2 text-sm">
                  {t("birthdayDay")}
                  <select
                    className={input}
                    value={birthDay}
                    disabled={saving || birthdayLocked}
                    onChange={(e) => {
                      setBirthDay(e.target.value);
                      setSaved(false);
                    }}
                  >
                    <option value="">—</option>
                    {Array.from({ length: 31 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm">
                  {t("birthdayMonth")}
                  <select
                    className={input}
                    value={birthMonth}
                    disabled={saving || birthdayLocked}
                    onChange={(e) => {
                      setBirthMonth(e.target.value);
                      setSaved(false);
                    }}
                  >
                    <option value="">—</option>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {monthName(i + 1)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-sm text-muted">
                {t(birthdayLocked ? "birthdayLocked" : "birthdayHint")}
              </p>
            </fieldset>
            <button
              className={primaryButton}
              disabled={
                saving ||
                (alias.trim() === (profile.alias ?? "") &&
                  country === (profile.country ?? "") &&
                  currency === profile.currency &&
                  birthDay === (profile.birthDay ? String(profile.birthDay) : "") &&
                  birthMonth === (profile.birthMonth ? String(profile.birthMonth) : ""))
              }
            >
              {t(saving ? "saving" : "save")}
            </button>
            <button type="button" className={secondaryButton} disabled={saving} onClick={cancelEdit}>{t("cancelEdit")}</button>
            {locked && (
              <p role="alert" className="text-sm text-error">
                {t("birthdayLocked")}
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
        <StreakSoundToggle address={account.address} />
        <button
          id="tarjetas"
          className={secondaryButton}
          aria-haspopup="dialog"
          onClick={() => setCards(true)}
        >
          {t("cards")}
        </button>
      </section>
      <MyBusinesses busy={saving} />
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
