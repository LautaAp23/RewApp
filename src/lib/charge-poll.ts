import type { ChargeView } from "./api/charges";

/** How often the till asks for the charge state while its QR is on screen. */
export const CHARGE_POLL_MS = 3000;

/** Terminal states: the till stops asking once the charge lands here. */
export function shouldStopChargePoll(status: ChargeView["status"]): boolean {
  return status === "PAID" || status === "EXPIRED";
}

/**
 * Polls `GET /api/charges/[id]` until the charge is PAID/EXPIRED or the
 * caller stops it. Returns a cleanup that clears the interval and aborts the
 * in-flight request, for the unmount/new-charge paths.
 *
 * Overlapping responses cannot overwrite newer state: each tick aborts the
 * previous request and a request counter drops answers that arrive late.
 */
export function startChargePoll(id: string, onCharge: (charge: ChargeView) => void): () => void {
  let stopped = false;
  let latest = 0;
  let controller: AbortController | undefined;

  async function tick() {
    if (stopped) return;
    controller?.abort();
    const request = ++latest;
    controller = new AbortController();
    try {
      const response = await fetch(`/api/charges/${encodeURIComponent(id)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok || stopped || request !== latest) return;
      const charge = (await response.json()) as ChargeView;
      if (stopped || request !== latest) return;
      onCharge(charge);
      if (shouldStopChargePoll(charge.status)) stop();
    } catch {
      // Aborted or offline: the next tick retries while the QR is visible.
    }
  }

  function stop() {
    stopped = true;
    clearInterval(timer);
    controller?.abort();
  }

  const timer = setInterval(() => void tick(), CHARGE_POLL_MS);
  void tick();
  return stop;
}
