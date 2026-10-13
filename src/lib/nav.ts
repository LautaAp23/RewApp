/** Bottom navigation: which tab owns which routes. The UI lives in components/bottom-nav.tsx. */

export const TABS = [
  { key: "home", href: "/inicio", owns: ["/inicio"] },
  { key: "redeem", href: "/canjear", owns: ["/canjear"] },
  { key: "friends", href: "/amigos", owns: ["/amigos", "/compartir"] },
  { key: "profile", href: "/perfil", owns: ["/perfil", "/tarjetas", "/respaldo"] },
  { key: "businesses", href: "/comercios", owns: ["/comercios", "/comercio"] },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

const SCAN_ROUTES = ["/escanear", "/pagar"];

/** `/perfil` owns `/perfil` and `/perfil/...`, never `/perfilado`. */
const owns = (route: string, pathname: string) =>
  pathname === route || pathname.startsWith(`${route}/`);

/** Index in TABS of the tab lit for `pathname`, or -1 when none is (scanner, top-up). */
export function activeTab(pathname: string): number {
  return TABS.findIndex((tab) => tab.owns.some((route) => owns(route, pathname)));
}

/** The scan button is lit on the scanner and on the payment screen it opens. */
export function isScanning(pathname: string): boolean {
  return SCAN_ROUTES.some((route) => owns(route, pathname));
}

/** Whether the nav is compact after scrolling from `from` to `to`, on a page that scrolls up to `max`. */
export function compactAfterScroll(compact: boolean, from: number, to: number, max: number): boolean {
  if (to <= 0 || max < 160) return false; // at the top (or bouncing above it), or nothing to scroll
  if (to >= max) return compact; // bottom bounce: hold
  if (to > from + 6 && to > 40) return true; // scrolling down
  if (to < from - 6) return false; // scrolling up
  return compact;
}

/** Lens position (fractional tab index) under a pointer at `x` px from the bar's inner left edge. */
export function lensAtPointer(x: number, innerWidth: number, tabs: number): number {
  if (innerWidth <= 0 || tabs <= 1) return 0;
  const at = (x / innerWidth) * tabs - 0.5;
  return Math.min(Math.max(at, 0), tabs - 1);
}
