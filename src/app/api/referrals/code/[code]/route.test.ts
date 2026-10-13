import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn(), program: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { profile: { findUnique: mocks.find } } }));
vi.mock("@/lib/server/referrals", () => ({ readReferralProgram: mocks.program }));
import { GET } from "./route";

const get = (code: string) => GET(new Request(`http://localhost/api/referrals/code/${code}`), { params: Promise.resolve({ code }) });
const program = { referrerBonus: "200", refereeBonus: "100", minAmount: "5000000", windowDays: 30, active: true };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.program.mockResolvedValue(program);
});

it("returns who invites and the program, never the address", async () => {
  mocks.find.mockResolvedValue({ alias: "Ana" });
  const response = await get("ANA-7K2Q");
  expect(await response.json()).toEqual({ code: "ana-7k2q", alias: "Ana", program });
  expect(mocks.find.mock.calls[0][0].where).toEqual({ referralCode: "ana-7k2q" });
});

it("404s an unknown code", async () => {
  mocks.find.mockResolvedValue(null);
  expect((await get("ana-7k2q")).status).toBe(404);
});

it("404s a malformed code without querying", async () => {
  expect((await get("0xabc")).status).toBe(404);
  expect(mocks.find).not.toHaveBeenCalled();
});
