/**
 * Global payment streak and its pot (docs/MODEL.md §5, "Constancia").
 * Mirrors RewAppPay: the counters live onchain, the pot is a pure function of the cycle day.
 */

/** Days in a cycle; the pot becomes claimable on the last one. */
export const STREAK_DAYS = 5;
/** Pot accumulated after N days (index = cycle day): contributions 5, 10, 20, 25, 50. */
export const STREAK_POTS = [0, 5, 15, 35, 60, 110] as const;
/** Gap in UTC days from which the streak breaks. 2 and 3 are the rescue window. */
export const STREAK_BREAK_GAP = 4;

const DAY_MS = 86_400_000;

/** UTC day number, the same base the contract uses (`block.timestamp / 1 days`). */
export function utcDay(ms: number): number {
  return Math.floor(ms / DAY_MS);
}

export type StreakStatus = "active" | "pending" | "at_risk" | "broken" | "claimable";

/** Raw onchain counters (`RewAppPay.streaks`). */
export type StreakCounters = { cycleDay: number; lastDay: number; claimed: boolean };

export type Streak = {
  /** Days lit in the current cycle (0 when there is no cycle running). */
  cycleDay: number;
  /** UTC day of the last qualifying payment. */
  lastDay: number;
  status: StreakStatus;
  /** Points the account keeps right now; 0 once broken or claimed. */
  pot: number;
  claimable: boolean;
  /** Paid today: the day's flame is already lit. */
  paidToday: boolean;
  /** Pot of the next day if the streak advances (what the next payment adds up to). */
  nextPot: number;
  /** End of the rescue window (ISO), only while at risk. */
  rescueEndsAt: string | null;
};

/**
 * Demo presets for `seedStreakForDemo` (testnet only, development tooling only): the cycle day and how
 * many days ago the last payment was. A real payment afterwards moves the streak for real.
 */
export const DEMO_STREAK_PRESETS = {
  /** 4/5 paid yesterday: today's payment completes the cycle. */
  almost: { cycleDay: 4, daysAgo: 1 },
  /** 5/5 ready to claim. */
  claimable: { cycleDay: 5, daysAgo: 0 },
  /** 3/5 two days ago: inside the rescue window. */
  atRisk: { cycleDay: 3, daysAgo: 2 },
  /** 3/5 five days ago: broken, pot lost. */
  broken: { cycleDay: 3, daysAgo: 5 },
} as const;

export type DemoStreakPreset = keyof typeof DEMO_STREAK_PRESETS;

export function isDemoStreakPreset(value: unknown): value is DemoStreakPreset {
  return typeof value === "string" && Object.hasOwn(DEMO_STREAK_PRESETS, value);
}

/** What the UI shows for a set of counters on `today` (UTC day). */
export function deriveStreak({ cycleDay, lastDay, claimed }: StreakCounters, today: number): Streak {
  const gap = today - lastDay;
  const base = { lastDay, rescueEndsAt: null, claimable: false };
  if (cycleDay >= STREAK_DAYS && !claimed) {
    return { ...base, cycleDay: STREAK_DAYS, status: "claimable", pot: STREAK_POTS[STREAK_DAYS], claimable: true, paidToday: gap === 0, nextPot: STREAK_POTS[STREAK_DAYS] };
  }
  // Claimed cycle or no cycle yet: the next payment starts day 1 (tomorrow if the last one was today).
  if (claimed || cycleDay === 0) {
    const paidToday = gap === 0 && (claimed || lastDay > 0);
    return { ...base, cycleDay: 0, status: paidToday ? "active" : "pending", pot: 0, paidToday, nextPot: STREAK_POTS[1] };
  }
  if (gap >= STREAK_BREAK_GAP) {
    return { ...base, cycleDay: 0, status: "broken", pot: 0, paidToday: false, nextPot: STREAK_POTS[1] };
  }
  const pot = STREAK_POTS[cycleDay];
  const nextPot = STREAK_POTS[cycleDay + 1];
  if (gap === 0) return { ...base, cycleDay, status: "active", pot, paidToday: true, nextPot };
  if (gap === 1) return { ...base, cycleDay, status: "pending", pot, paidToday: false, nextPot };
  return {
    ...base,
    cycleDay,
    status: "at_risk",
    pot,
    paidToday: false,
    nextPot,
    rescueEndsAt: new Date((lastDay + STREAK_BREAK_GAP) * DAY_MS).toISOString(),
  };
}
