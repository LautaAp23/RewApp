"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useAccount } from "@/lib/account/account-context";
import { useNotifications } from "@/lib/use-notifications";
/** Profile on the left, logo in the middle, notifications on the right. App navigation lives in BottomNav. */
export function AppHeader() {
  const t = useTranslations("navigation"),
    tn = useTranslations("notifications"),
    account = useAccount(),
    pathname = usePathname();
  const { unread } = useNotifications(account.address);
  const [name, setName] = useState("");
  useEffect(() => setName(""), [account.address]);
  useEffect(() => {
    if (!account.address) return;
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/profile/${account.address}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const profile = await response.json();
        if (active) setName(profile.alias ?? "");
      } catch {}
    };
    void load();
    window.addEventListener("rewapp:profile-updated", load);
    return () => {
      active = false;
      window.removeEventListener("rewapp:profile-updated", load);
    };
  }, [account.address, pathname]);
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
  return (
    <header className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
      <Link
        href="/perfil"
        className="pressable flex min-w-0 items-center gap-3 justify-self-start rounded-button bg-surface py-1.5 pr-4 pl-1.5"
      >
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-elevated font-semibold text-accent"
        >
          {initials || (
            <svg
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
            </svg>
          )}
        </span>
        <span className="truncate font-semibold">
          {name || t("yourAccount")}
        </span>
      </Link>
      <Image src="/logo.png" alt="RewApp" width={36} height={36} priority />
      {account.address ? (
        <Link
          href="/notificaciones"
          aria-label={tn("title")}
          className="glass-strong liquid-glass pressable relative flex h-12 w-12 items-center justify-center justify-self-end rounded-full border border-white/10 text-text"
        >
          <svg
            aria-hidden
            className="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {unread > 0 ? (
            <span
              aria-hidden
              className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-reward"
            />
          ) : null}
        </Link>
      ) : (
        <span aria-hidden />
      )}
    </header>
  );
}
