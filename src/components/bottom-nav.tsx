"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const icon = "h-6 w-6";

function HomeIcon() {
  return (
    <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" strokeLinejoin="round" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M7 12h10" strokeLinecap="round" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0" strokeLinejoin="round" />
    </svg>
  );
}

/** Client tabs: Inicio, Escanear (highlighted) and Canjear (docs/PLAN.md §3). */
export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const tab = (href: string) =>
    `flex min-h-12 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold ${
      pathname.startsWith(href) ? "text-primary" : "text-muted"
    }`;

  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-10 border-t border-elevated bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-md items-end px-6 pt-2 pb-2">
        <Link href="/inicio" className={tab("/inicio")} aria-current={pathname.startsWith("/inicio") ? "page" : undefined}>
          <HomeIcon />
          {t("home")}
        </Link>
        <Link
          href="/escanear"
          className="-mt-8 flex flex-1 flex-col items-center gap-1 text-xs font-semibold text-text"
          aria-current={pathname.startsWith("/escanear") ? "page" : undefined}
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-on-primary shadow-glow active:bg-primary-pressed">
            <ScanIcon />
          </span>
          {t("scan")}
        </Link>
        <Link href="/canjear" className={tab("/canjear")} aria-current={pathname.startsWith("/canjear") ? "page" : undefined}>
          <GiftIcon />
          {t("redeem")}
        </Link>
      </div>
    </nav>
  );
}
