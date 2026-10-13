import { describe, expect, it } from "vitest";
import { deriveStreak, STREAK_POTS, utcDay } from "./streak";

const today = 20_373;

describe("deriveStreak", () => {
  it("matches the contract pot table", () => {
    expect(STREAK_POTS).toEqual([0, 5, 15, 35, 60, 110]);
  });

  it("paid today keeps the streak alive", () => {
    expect(deriveStreak({ cycleDay: 3, lastDay: today, claimed: false }, today)).toMatchObject({
      status: "active", cycleDay: 3, pot: 35, paidToday: true, nextPot: 60, claimable: false,
    });
  });

  it("yesterday's payment leaves today pending", () => {
    expect(deriveStreak({ cycleDay: 4, lastDay: today - 1, claimed: false }, today)).toMatchObject({
      status: "pending", cycleDay: 4, pot: 60, paidToday: false, nextPot: 110,
    });
  });

  it.each([2, 3])("a gap of %i days is at risk with the pot intact", (gap) => {
    const streak = deriveStreak({ cycleDay: 3, lastDay: today - gap, claimed: false }, today);
    expect(streak).toMatchObject({ status: "at_risk", cycleDay: 3, pot: 35 });
    expect(streak.rescueEndsAt).toBe(new Date((today - gap + 4) * 86_400_000).toISOString());
  });

  it("a gap of 4 or more breaks it and loses the pot", () => {
    expect(deriveStreak({ cycleDay: 4, lastDay: today - 4, claimed: false }, today)).toMatchObject({
      status: "broken", cycleDay: 0, pot: 0, nextPot: 5,
    });
  });

  it("a complete unclaimed cycle is claimable no matter how long ago", () => {
    expect(deriveStreak({ cycleDay: 5, lastDay: today - 90, claimed: false }, today)).toMatchObject({
      status: "claimable", cycleDay: 5, pot: 110, claimable: true,
    });
  });

  it("after claiming, a new cycle starts with the next payment", () => {
    expect(deriveStreak({ cycleDay: 5, lastDay: today, claimed: true }, today)).toMatchObject({
      status: "active", cycleDay: 0, pot: 0, claimable: false, paidToday: true,
    });
    expect(deriveStreak({ cycleDay: 5, lastDay: today - 2, claimed: true }, today)).toMatchObject({
      status: "pending", cycleDay: 0, pot: 0, paidToday: false, nextPot: 5,
    });
  });

  it("a new account waits for its first payment", () => {
    expect(deriveStreak({ cycleDay: 0, lastDay: 0, claimed: false }, today)).toMatchObject({
      status: "pending", cycleDay: 0, pot: 0, paidToday: false, nextPot: 5,
    });
  });
});

describe("utcDay", () => {
  it("uses the contract's day base", () => {
    expect(utcDay(1_760_000_000_000)).toBe(Math.floor(1_760_000_000 / 86_400));
  });
});
