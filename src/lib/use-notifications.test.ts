import { describe, expect, it } from "vitest";
import { deriveNotices, type NoticeInput } from "./use-notifications";

const base: NoticeInput = {
  now: new Date("2026-06-15T12:00:00"),
  points: 100n,
  visited: [],
  country: null,
  birthMonth: null,
  rewards: [],
  events: [],
  seenRewardIds: [],
  birthdayRedeemedIds: [],
};

const reward = (overrides = {}) => ({
  id: 1,
  title: "Café de prueba",
  description: "Un café",
  pointsCost: "300",
  available: true,
  ...overrides,
});

const event = (overrides = {}) => ({
  id: "e1",
  title: "Noche de café",
  description: "Música en vivo",
  startsAt: "2026-06-20T20:00:00.000Z",
  merchant: { name: "Café Demo", city: "Salta", country: "AR", address: "0xabc" },
  ...overrides,
});

describe("deriveNotices", () => {
  it("orders birthday, rewards, merchant events, then platform events", () => {
    const notices = deriveNotices({
      ...base,
      visited: ["0xabc"],
      birthMonth: 6,
      rewards: [reward()],
      events: [event()],
    });
    const kinds = notices.map((n) => n.kind);
    expect(kinds[0]).toBe("birthday");
    expect(kinds[1]).toBe("reward_new");
    expect(kinds[2]).toBe("merchant_event");
    expect(kinds.slice(3)).toEqual(["platform_event", "platform_event"]);
  });

  it("shows merchant events for visited merchants", () => {
    const notices = deriveNotices({ ...base, visited: ["0xabc"], events: [event()] });
    expect(notices.some((n) => n.kind === "merchant_event")).toBe(true);
  });

  it("shows merchant events for the same country without visits", () => {
    const notices = deriveNotices({ ...base, country: "AR", events: [event()] });
    expect(notices.some((n) => n.kind === "merchant_event")).toBe(true);
  });

  it("hides merchant events from other cities the user never visited", () => {
    const notices = deriveNotices({ ...base, country: "ES", events: [event()] });
    expect(notices.some((n) => n.kind === "merchant_event")).toBe(false);
  });

  it("marks a reward as reachable when points cover the cost", () => {
    const notices = deriveNotices({
      ...base,
      points: 500n,
      rewards: [reward()],
      seenRewardIds: [1],
    });
    const notice = notices.find((n) => n.id === "reward-1");
    expect(notice?.titleKey).toBe("reward.reachableTitle");
  });

  it("hides seen rewards that are still out of reach", () => {
    const notices = deriveNotices({
      ...base,
      points: 10n,
      rewards: [reward()],
      seenRewardIds: [1],
    });
    expect(notices.some((n) => n.id === "reward-1")).toBe(false);
  });

  it("shows the birthday notice in the birth month and grace week", () => {
    const inMonth = deriveNotices({ ...base, birthMonth: 6 });
    expect(inMonth.some((n) => n.kind === "birthday")).toBe(true);
    const grace = deriveNotices({
      ...base,
      now: new Date("2026-07-03T12:00:00"),
      birthMonth: 6,
    });
    expect(grace.some((n) => n.id === "birthday-2026-6")).toBe(true);
    const late = deriveNotices({
      ...base,
      now: new Date("2026-07-20T12:00:00"),
      birthMonth: 6,
    });
    expect(late.some((n) => n.kind === "birthday")).toBe(false);
  });

  it("hides the birthday notice once redeemed this year", () => {
    const notices = deriveNotices({
      ...base,
      birthMonth: 6,
      birthdayRedeemedIds: ["birthday-2026-6"],
    });
    expect(notices.some((n) => n.kind === "birthday")).toBe(false);
  });
});
