"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { TABS, activeTab, compactAfterScroll, isScanning, type TabKey } from "@/lib/nav";

/** Same as the `translate` transition of `.nav-lens` in globals.css. */
const LENS_TRAVEL_MS = 320;

function NavIcon({ kind, pop = false }: { kind: TabKey | "scan"; pop?: boolean }) {
  return (
    <svg
      className={`nav-icon ${kind === "scan" ? "h-7 w-7" : "h-6 w-6"}${pop ? " animate-tab-pop" : ""}`}
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

/** Floating tab bar: a glass lens glides to the active tab, and the bar shrinks while scrolling down. */
export function BottomNav() {
  const t = useTranslations("nav"),
    pathname = usePathname();
  const active = activeTab(pathname),
    scanning = isScanning(pathname);
  // Where the lens sits. It keeps its last place while no tab is active, so it fades out there.
  const [lensAt, setLensAt] = useState(() => Math.max(active, 0));
  const previous = useRef(active);
  const [moving, setMoving] = useState(false);
  // The icon that pops: `n` re-keys it so the animation replays on every change.
  const [pop, setPop] = useState({ tab: -1, n: 0 });
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    if (previous.current === active) return;
    const from = previous.current;
    previous.current = active;
    if (active === -1) return;
    setLensAt(active);
    setPop((p) => ({ tab: active, n: p.n + 1 }));
    if (from === -1) return;
    setMoving(true);
    const timer = window.setTimeout(() => setMoving(false), LENS_TRAVEL_MS);
    return () => window.clearTimeout(timer);
  }, [active]);

  useEffect(() => setCompact(false), [pathname]);

  useEffect(() => {
    // Compacting hides the labels, so with reduced motion the bar never shrinks.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let last = window.scrollY,
      frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY,
          max = document.documentElement.scrollHeight - window.innerHeight;
        setCompact((c) => compactAfterScroll(c, last, y, max));
        last = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  // A short tick when the selection changes. Android only: iOS has no vibration API.
  const tick = () => navigator.vibrate?.(8);

  return (
    <nav
      aria-label={t("label")}
      data-compact={compact || undefined}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-10 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto flex max-w-md items-center gap-2">
        <div
          className="glass-strong pointer-events-auto relative flex min-w-0 flex-1 items-center rounded-button border border-white/10 p-1.5 shadow-lift"
          style={{ "--tabs": TABS.length, "--tab": lensAt } as CSSProperties}
        >
          <span
            aria-hidden
            className="nav-lens"
            data-hidden={active === -1 || undefined}
            data-moving={moving || undefined}
          />
          {TABS.map((tab, i) => {
            const current = i === active;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={current ? "page" : undefined}
                onClick={current ? undefined : tick}
                className={`nav-tab pressable relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full px-1 py-2 text-[10px] font-semibold ${current ? "text-accent" : "text-muted hover:text-text"}`}
              >
                <NavIcon key={pop.tab === i ? pop.n : "idle"} kind={tab.key} pop={pop.tab === i} />
                <span className="nav-label">
                  <span>{t(tab.key)}</span>
                </span>
              </Link>
            );
          })}
        </div>
        <Link
          href="/escanear"
          aria-current={scanning ? "page" : undefined}
          onClick={scanning ? undefined : tick}
          className={`nav-scan pressable pointer-events-auto flex shrink-0 flex-col items-center justify-center gap-1 rounded-full gradient-primary text-on-primary shadow-glow ${scanning ? "ring-2 ring-accent ring-offset-2 ring-offset-background" : ""}`}
        >
          <NavIcon kind="scan" />
          <span className="nav-label text-[10px] font-semibold">
            <span>{t("scan")}</span>
          </span>
        </Link>
      </div>
    </nav>
  );
}
