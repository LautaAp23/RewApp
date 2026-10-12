"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
function NavIcon({
  kind,
}: {
  kind: "home" | "redeem" | "friends" | "profile" | "scan";
}) {
  return (
    <svg
      className={kind === "scan" ? "h-7 w-7" : "h-6 w-6"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {kind === "home" && <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />}
      {kind === "redeem" && (
        <>
          <path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0" />
        </>
      )}
      {kind === "friends" && (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M21 20v-2a6 6 0 0 0-4-5" />
        </>
      )}
      {kind === "profile" && (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
        </>
      )}
      {kind === "scan" && (
        <>
          <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
          <path d="M8 8h2v2H8zM14 8h2v2h-2zM8 14h2v2H8zM14 14h2v2h-2z" />
        </>
      )}
    </svg>
  );
}
export function BottomNav() {
  const t = useTranslations("nav"),
    pathname = usePathname();
  const tabs = [
    { href: "/inicio", key: "home", active: pathname === "/inicio" },
    {
      href: "/canjear",
      key: "redeem",
      active: pathname.startsWith("/canjear"),
    },
    {
      href: "/amigos",
      key: "friends",
      active:
        pathname.startsWith("/amigos") || pathname.startsWith("/compartir"),
    },
    {
      href: "/perfil",
      key: "profile",
      active: ["/perfil", "/tarjetas", "/respaldo", "/comercio"].some((p) =>
        pathname.startsWith(p),
      ),
    },
  ] as const;
  const scanning =
    pathname.startsWith("/escanear") || pathname.startsWith("/pagar");
  return (
    <nav
      aria-label={t("label")}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-10 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto flex max-w-md items-center gap-3">
        <div className="glass-strong pointer-events-auto flex min-w-0 flex-1 items-center rounded-button border border-white/10 p-1.5 shadow-lift">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={`pressable flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full px-1 py-2 text-[10px] font-semibold ${tab.active ? "bg-elevated text-accent" : "text-muted hover:bg-elevated/50"}`}
            >
              <NavIcon kind={tab.key} />
              <span>{t(tab.key)}</span>
            </Link>
          ))}
        </div>
        <Link
          href="/escanear"
          className={`pressable pointer-events-auto flex h-[4.5rem] w-[4.5rem] shrink-0 flex-col items-center justify-center gap-1 rounded-full gradient-primary text-on-primary shadow-glow ${scanning ? "ring-2 ring-accent ring-offset-2 ring-offset-background" : ""}`}
          aria-current={scanning ? "page" : undefined}
        >
          <NavIcon kind="scan" />
          <span className="text-[10px] font-semibold">{t("scan")}</span>
        </Link>
      </div>
    </nav>
  );
}
