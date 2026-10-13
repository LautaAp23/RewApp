import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ profile: vi.fn(), profiles: vi.fn(), sent: vi.fn(), received: vi.fn(), program: vi.fn(), reconcile: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    profile: { findUnique: mocks.profile, findMany: mocks.profiles },
    referral: { findMany: mocks.sent, findUnique: mocks.received },
  },
}));
vi.mock("@/lib/server/referrals", () => ({ readReferralProgram: mocks.program, reconcileReferral: mocks.reconcile }));
import { GET } from "./route";

const ana = "0x1111111111111111111111111111111111111111";
const beto = "0x2222222222222222222222222222222222222222";
const caro = "0x3333333333333333333333333333333333333333";
const get = (address: string) => GET(new Request(`http://localhost/api/referrals/${address}`), { params: Promise.resolve({ address }) });
const row = (referee: string, status: string, extra = {}) => ({
  referee, referrer: ana, status, expiresAt: new Date("2099-01-01"), referrerBonus: null,
  createdAt: new Date("2026-10-13T12:00:00Z"), ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.reconcile.mockImplementation(async (r) => r);
  mocks.program.mockResolvedValue({ referrerBonus: "200", refereeBonus: "100", minAmount: "5000000", windowDays: 30, active: true });
  mocks.profile.mockResolvedValue({ referralCode: "ana-7k2q" });
  mocks.received.mockResolvedValue(null);
  mocks.profiles.mockResolvedValue([{ address: beto, alias: "Beto" }]);
});

it("lists the invited friends with their status and sums what was earned", async () => {
  mocks.sent.mockResolvedValue([
    row(beto, "REWARDED", { referrerBonus: "200" }),
    row(caro, "ARMED"),
  ]);
  const view = await (await get(ana)).json();
  expect(view.code).toBe("ana-7k2q");
  expect(view.earned).toBe("200");
  expect(view.invited).toEqual([
    { id: beto, alias: "Beto", status: "rewarded", referrerBonus: "200", at: "2026-10-13T12:00:00.000Z" },
    { id: caro, alias: null, status: "pending", referrerBonus: null, at: "2026-10-13T12:00:00.000Z" },
  ]);
  expect(mocks.reconcile).toHaveBeenCalledTimes(2);
});

it("tells the invitee who invited them while it is pending", async () => {
  mocks.sent.mockResolvedValue([]);
  mocks.received.mockResolvedValue(row(beto, "ARMED", { referrer: ana }));
  mocks.profiles.mockResolvedValue([{ address: ana, alias: "Ana" }]);
  const view = await (await get(beto)).json();
  expect(view.myInvite).toEqual({ alias: "Ana", status: "pending" });
});

it("rejects an invalid address", async () => {
  expect((await get("nope")).status).toBe(400);
});
