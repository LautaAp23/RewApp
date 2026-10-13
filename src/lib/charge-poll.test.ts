import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHARGE_POLL_MS, shouldStopChargePoll, startChargePoll } from "./charge-poll";
import type { ChargeView } from "./api/charges";

function view(status: ChargeView["status"]): ChargeView {
  return {
    id: "charge-1",
    chargeId: "0x00",
    status,
    expiresAt: "2030-01-01T00:00:00Z",
    merchant: { name: "Demo", logoUrl: null, category: "cafe", address: "0x1111111111111111111111111111111111111111" },
    localAmount: "3500.00",
    localCurrency: "ARS",
    usdAmount: "3500000",
    payerAmount: null,
    reward: null,
    txHash: null,
    payer: null,
    payerName: null,
  } as ChargeView;
}

function jsonResponse(charge: ChargeView): Response {
  return { ok: true, json: async () => charge } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllTimers();
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function fetchMock() {
  return vi.mocked(fetch);
}

describe("charge polling for the till", () => {
  it("starts with an immediate no-store request and repeats every 3s", async () => {
    fetchMock().mockResolvedValue(jsonResponse(view("PENDING")));
    const onCharge = vi.fn();
    startChargePoll("charge-1", onCharge);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/charges/charge-1", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
    await vi.advanceTimersByTimeAsync(CHARGE_POLL_MS * 2);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(onCharge).toHaveBeenCalledTimes(3);
  });

  it("stops the interval once the charge is PAID", async () => {
    fetchMock().mockResolvedValue(jsonResponse(view("PAID")));
    const onCharge = vi.fn();
    startChargePoll("charge-1", onCharge);
    await vi.advanceTimersByTimeAsync(0);
    expect(onCharge).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(CHARGE_POLL_MS * 3);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("stops the interval once the charge is EXPIRED", async () => {
    fetchMock().mockResolvedValue(jsonResponse(view("EXPIRED")));
    const onCharge = vi.fn();
    startChargePoll("charge-1", onCharge);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(CHARGE_POLL_MS * 3);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onCharge).toHaveBeenCalledTimes(1);
  });

  it("cleanup clears the interval and aborts the in-flight request", async () => {
    let rejectInFlight!: (reason: unknown) => void;
    fetchMock().mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectInFlight = reject;
        }),
    );
    const onCharge = vi.fn();
    const stop = startChargePoll("charge-1", onCharge);
    await vi.advanceTimersByTimeAsync(0);
    const [, init] = fetchMock().mock.calls[0] as [string, { signal: AbortSignal }];
    expect(init.signal.aborted).toBe(false);
    stop();
    expect(init.signal.aborted).toBe(true);
    rejectInFlight(new DOMException("aborted", "AbortError"));
    await vi.advanceTimersByTimeAsync(CHARGE_POLL_MS * 3);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onCharge).not.toHaveBeenCalled();
  });

  it("drops late answers so they never overwrite newer state", async () => {
    const pending = jsonResponse(view("PENDING"));
    let resolveFirst!: (value: Response) => void;
    fetchMock()
      .mockImplementationOnce(() => new Promise((resolve) => void (resolveFirst = resolve)))
      .mockResolvedValue(jsonResponse({ ...view("PAID"), payerName: "Ana" }));
    const seen: ChargeView[] = [];
    startChargePoll("charge-1", (charge) => void seen.push(charge));
    await vi.advanceTimersByTimeAsync(0);
    // The second tick fires while the first answer is still in flight.
    await vi.advanceTimersByTimeAsync(CHARGE_POLL_MS);
    resolveFirst(pending);
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toHaveLength(1);
    expect(seen[0].status).toBe("PAID");
    expect(seen[0].payerName).toBe("Ana");
  });

  it("retries after a failed request while the QR is visible", async () => {
    fetchMock().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(jsonResponse(view("PENDING")));
    const onCharge = vi.fn();
    startChargePoll("charge-1", onCharge);
    await vi.advanceTimersByTimeAsync(0);
    expect(onCharge).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(CHARGE_POLL_MS);
    expect(onCharge).toHaveBeenCalledTimes(1);
  });

  it("marks PAID and EXPIRED as terminal states only", () => {
    expect(shouldStopChargePoll("PAID")).toBe(true);
    expect(shouldStopChargePoll("EXPIRED")).toBe(true);
    expect(shouldStopChargePoll("PENDING")).toBe(false);
    expect(shouldStopChargePoll("PROCESSING")).toBe(false);
    expect(shouldStopChargePoll("SPLIT")).toBe(false);
  });
});
