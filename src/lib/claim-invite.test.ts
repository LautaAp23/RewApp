import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { claimGuard, claimSavedInvite, INVITE_CLAIMED_EVENT } from "./claim-invite";
import { readInvite, saveInvite } from "./referral-storage";

const sign = vi.fn(async (code: string) => ({ account: "0x1111111111111111111111111111111111111111" as const, code, deadline: "1", signature: "0x12" as const }));
function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}
const answer = (status: number, error?: string) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(error ? { error } : { status: "arming" }), { status })));

const dispatched = vi.fn();
beforeEach(() => {
  vi.stubGlobal("window", { localStorage: memoryStorage(), dispatchEvent: dispatched });
  sign.mockClear();
  dispatched.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

it("does nothing without a saved invite", async () => {
  answer(202);
  expect(await claimSavedInvite(sign)).toBe("none");
  expect(sign).not.toHaveBeenCalled();
});

it("claims and forgets the invite", async () => {
  saveInvite("ana-7k2q", "Ana");
  answer(202);
  expect(await claimSavedInvite(sign)).toBe("claimed");
  expect(readInvite()).toBeNull();
});

it.each([
  [409, "referral_closed"], [409, "already_referred"], [409, "own_code"], [404, "referral_code_not_found"],
])("drops it on %i %s: retrying can never succeed", async (status, error) => {
  saveInvite("ana-7k2q", "Ana");
  answer(status, error);
  expect(await claimSavedInvite(sign)).toBe("dropped");
  expect(readInvite()).toBeNull();
});

it.each([
  [409, "referrals_paused"], [429, "rate_limited"], [503, "service_unavailable"], [502, "relay_failed"],
])("keeps it on %i %s to retry later", async (status, error) => {
  saveInvite("ana-7k2q", "Ana");
  answer(status, error);
  expect(await claimSavedInvite(sign)).toBe("kept");
  expect(readInvite()?.code).toBe("ana-7k2q");
});

it("keeps it when the network fails", async () => {
  saveInvite("ana-7k2q", "Ana");
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
  expect(await claimSavedInvite(sign)).toBe("kept");
});

it("tells the screens when the claim went through, so they can refresh", async () => {
  saveInvite("ana-7k2q", "Ana");
  answer(202);
  await claimSavedInvite(sign);
  expect(dispatched).toHaveBeenCalledTimes(1);
  expect(dispatched.mock.calls[0][0].type).toBe(INVITE_CLAIMED_EVENT);
});

it("does not announce a claim that was kept for later", async () => {
  saveInvite("ana-7k2q", "Ana");
  answer(503, "service_unavailable");
  await claimSavedInvite(sign);
  expect(dispatched).not.toHaveBeenCalled();
});

it("claims once per account, and again for another account in the same page load", () => {
  const ana = "0x1111111111111111111111111111111111111111";
  const beto = "0x2222222222222222222222222222222222222222";
  const shouldClaim = claimGuard();
  expect(shouldClaim("busy", undefined)).toBe(false);
  expect(shouldClaim("signed-in", ana)).toBe(true);
  expect(shouldClaim("signed-in", ana)).toBe(false);
  expect(shouldClaim("signed-out", undefined)).toBe(false);
  expect(shouldClaim("signed-in", beto)).toBe(true);
});
