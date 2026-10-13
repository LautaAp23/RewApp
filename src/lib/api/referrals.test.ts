import { describe, expect, it } from "vitest";
import { friendStatus, inviteStatus, type InvitedFriend } from "./referrals";

const now = new Date("2026-10-13T12:00:00Z");
const later = new Date("2026-11-01T00:00:00Z");
const earlier = new Date("2026-10-01T00:00:00Z");

describe("inviteStatus", () => {
  it.each([
    [{ status: "ARMING", expiresAt: null }, "pending"],
    [{ status: "ARMED", expiresAt: later }, "pending"],
    [{ status: "ARMED", expiresAt: earlier }, "expired"],
    [{ status: "REWARDED", expiresAt: earlier }, "rewarded"],
    [{ status: "FAILED", expiresAt: null }, null],
  ])("%o → %s", (row, expected) => expect(inviteStatus(row, now)).toBe(expected));
});

describe("friendStatus", () => {
  const friend = (overrides: Partial<InvitedFriend>): InvitedFriend => ({
    id: "0x1", alias: "Beto", status: "pending", referrerBonus: null, at: now.toISOString(), ...overrides,
  });
  it("shows the points the referrer earned", () => {
    expect(friendStatus(friend({ status: "rewarded", referrerBonus: "200" }))).toEqual({ key: "statusRewarded", points: "200" });
  });
  it("never says 'you earned 0' when the cap or the own shop left the referrer without bonus", () => {
    expect(friendStatus(friend({ status: "rewarded", referrerBonus: "0" }))).toEqual({ key: "statusRewardedNoBonus" });
    expect(friendStatus(friend({ status: "rewarded", referrerBonus: null }))).toEqual({ key: "statusRewardedNoBonus" });
  });
  it("maps pending and expired", () => {
    expect(friendStatus(friend({ status: "pending" }))).toEqual({ key: "statusPending" });
    expect(friendStatus(friend({ status: "expired" }))).toEqual({ key: "statusExpired" });
  });
});
