"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { useAccount } from "@/lib/account/account-context";
const iconButton =
  "pressable flex h-12 w-12 items-center justify-center rounded-full text-text hover:bg-elevated active:bg-elevated";
function UserIcon() {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    </svg>
  );
}
export function AppHeader() {
  const t = useTranslations("navigation"),
    pathname = usePathname(),
    account = useAccount();
  const [open, setOpen] = useState(false),
    [merchant, setMerchant] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    titleId = useId();
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    close();
  }, [pathname, close]);
  useEffect(() => {
    setMerchant(false);
    if (!account.address) return;
    let active = true;
    void fetch(`/api/navigation/${account.address}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active) setMerchant(!!data?.merchant);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [account.address]);
  useEffect(() => {
    const node = dialog.current;
    if (!open || !node) return;
    const opener = trigger.current;
    const overflow = document.body.style.overflow;
    node.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      node.close();
      document.body.style.overflow = overflow;
      opener?.focus({ preventScroll: true });
    };
  }, [open]);
  const entries = [
    { href: "/inicio", key: "home" },
    { href: "/amigos", key: "friends" },
    { href: "/amigos#cuentas", key: "shared" },
    { href: "/canjear", key: "rewards" },
    { href: "/perfil", key: "profile" },
    { href: "/perfil?tarjetas=1", key: "cards" },
    { href: "/respaldo", key: "backup" },
  ] as const;
  return (
    <>
      <header className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3">
        <Link
          href="/perfil"
          className={iconButton}
          aria-label={t("profile")}
          aria-current={pathname === "/perfil" ? "page" : undefined}
        >
          <UserIcon />
        </Link>
        <Link
          href="/inicio"
          className="justify-self-center text-xl font-bold"
          aria-label={t("brandHome")}
        >
          RewApp
        </Link>
        <button
          ref={trigger}
          className={iconButton}
          aria-label={t("open")}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <svg
            className="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="navigation-drawer fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-[calc(100%-1.5rem)] max-w-sm overflow-y-auto border-0 border-l border-elevated bg-surface p-0 text-text"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            close();
        }}
      >
        <div className="flex min-h-full flex-col gap-6 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between">
            <h2 id={titleId} className="text-xl font-bold">
              {t("title")}
            </h2>
            <button
              autoFocus
              className={iconButton}
              aria-label={t("close")}
              onClick={close}
            >
              <svg
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <nav aria-label={t("title")} className="flex flex-col gap-1">
            {entries.map((e) => (
              <Link
                key={e.key}
                href={e.href}
                onClick={close}
                aria-current={pathname === e.href ? "page" : undefined}
                className={`pressable flex min-h-12 items-center rounded-card px-4 py-3 font-medium hover:bg-elevated ${pathname === e.href ? "bg-elevated text-accent" : "text-text"}`}
              >
                {t(e.key)}
              </Link>
            ))}
          </nav>
          {merchant && (
            <section className="border-t border-elevated pt-5">
              <h3 className="mb-2 px-4 text-sm font-semibold text-muted">
                {t("merchant")}
              </h3>
              <Link
                href="/comercio/recompensas"
                className="pressable flex min-h-12 items-center rounded-card px-4 py-3 font-medium hover:bg-elevated"
                onClick={close}
              >
                {t("manageRewards")}
              </Link>
            </section>
          )}
          <div className="mt-auto flex flex-col gap-4 border-t border-elevated pt-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted">{t("language")}</span>
              <LocaleSwitcher />
            </div>
            <button
              className="pressable min-h-12 rounded-card px-4 text-left font-medium text-error hover:bg-elevated"
              onClick={() => {
                close();
                account.endSession();
              }}
            >
              {t("signOut")}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
