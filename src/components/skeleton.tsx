/** Loading placeholder: a glass bar with the brand's light sweep (`shimmer`).
 *  Always hidden from assistive tech; the caller announces the loading text. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`shimmer block rounded-full bg-elevated/60 ${className}`} />;
}
