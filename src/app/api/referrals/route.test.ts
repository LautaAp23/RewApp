import { beforeEach, expect, it, vi } from "vitest";
import { BaseError, decodeFunctionData } from "viem";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/contracts", async () => {
  const actual = await vi.importActual<object>("@/lib/contracts");
  return { ...actual, contractAddresses: { rewAppPay: "0x3333333333333333333333333333333333333333" } };
});
const mocks = vi.hoisted(() => ({
  verify: vi.fn(), profile: vi.fn(), referral: vi.fn(), charge: vi.fn(), count: vi.fn(), upsert: vi.fn(),
  update: vi.fn(), funded: vi.fn(), simulate: vi.fn(), relay: vi.fn(), revert: vi.fn(),
}));
vi.mock("@/lib/api/signed-request", () => ({ verifySignedRequest: mocks.verify }));
vi.mock("@/lib/db", () => ({
  db: {
    profile: { findUnique: mocks.profile },
    referral: { findUnique: mocks.referral, count: mocks.count, upsert: mocks.upsert, update: mocks.update },
    charge: { findFirst: mocks.charge },
  },
}));
vi.mock("@/lib/server/chain", () => ({ publicClient: { simulateContract: mocks.simulate } }));
vi.mock("@/lib/server/relayer", () => ({
  assertRelayerFunded: mocks.funded,
  getRelayer: () => ({ account: { address: "0x5555555555555555555555555555555555555555" } }),
}));
vi.mock("@/lib/server/durable-relay", () => ({ durableRelay: mocks.relay }));
vi.mock("@/lib/server/revert", () => ({ revertCode: mocks.revert }));
import { rewAppPayAbi } from "@/lib/contracts";
import { REFERRALS_PER_IP_PER_HOUR } from "@/lib/api/referrals";
import { POST } from "./route";

const account = "0x1111111111111111111111111111111111111111";
const referrer = "0x2222222222222222222222222222222222222222";
const claim = (body: Record<string, unknown> = {}) =>
  POST(new Request("http://localhost/api/referrals", {
    method: "POST",
    headers: { "x-forwarded-for": "9.9.9.9" },
    body: JSON.stringify({ account, code: "ana-7k2q", deadline: "1800000000", signature: "0x1234", ...body }),
  }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.verify.mockResolvedValue("ok");
  mocks.profile.mockResolvedValue({ address: referrer });
  mocks.referral.mockResolvedValue(null);
  mocks.charge.mockResolvedValue(null);
  mocks.count.mockResolvedValue(0);
  mocks.funded.mockResolvedValue(undefined);
  mocks.simulate.mockResolvedValue({});
  mocks.relay.mockImplementation(async (_to, _data, save) => { await save(`0x${"ab".repeat(32)}`); return "0xhash"; });
});

it("records the referral onchain and answers 202 without waiting for the receipt", async () => {
  const response = await claim();
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ status: "arming" });
  expect(mocks.upsert.mock.calls[0][0].create).toMatchObject({ referee: account, referrer, code: "ana-7k2q", ip: "9.9.9.9" });
  const [, data] = mocks.relay.mock.calls[0];
  expect(decodeFunctionData({ abi: rewAppPayAbi, data })).toMatchObject({ functionName: "setReferral", args: [account, referrer] });
  expect(mocks.update.mock.calls[0][0].data).toEqual({ armTxHash: `0x${"ab".repeat(32)}` });
});

it("accepts a typed code with uppercase and spaces", async () => {
  expect((await claim({ code: " ANA-7K2Q " })).status).toBe(202);
  expect(mocks.profile.mock.calls[0][0].where).toEqual({ referralCode: "ana-7k2q" });
});

it.each([
  ["unknown code", () => mocks.profile.mockResolvedValue(null), 404, "referral_code_not_found"],
  ["own code", () => mocks.profile.mockResolvedValue({ address: account }), 409, "own_code"],
  ["already referred", () => mocks.referral.mockResolvedValue({ status: "ARMED" }), 409, "already_referred"],
  ["already paid", () => mocks.charge.mockResolvedValue({ id: "c1" }), 409, "referral_closed"],
  ["too many from this IP", () => mocks.count.mockResolvedValue(REFERRALS_PER_IP_PER_HOUR), 429, "rate_limited"],
  ["relayer without gas", () => mocks.funded.mockRejectedValue(new Error("gas")), 503, "service_unavailable"],
])("%s → %i %s, without relaying", async (_name, arrange, status, error) => {
  arrange();
  const response = await claim();
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error });
  expect(mocks.relay).not.toHaveBeenCalled();
});

it.each(["already_referred", "referral_closed", "referrals_paused"])("maps the contract revert to 409 %s", async (code) => {
  mocks.simulate.mockRejectedValue(new BaseError("reverted"));
  mocks.revert.mockReturnValue(code);
  const response = await claim();
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: code });
});

it("lets a FAILED referral be claimed again", async () => {
  mocks.referral.mockResolvedValue({ status: "FAILED" });
  expect((await claim()).status).toBe(202);
  expect(mocks.upsert.mock.calls[0][0].update).toMatchObject({ status: "ARMING", armTxHash: null });
});

it("marks FAILED when the relay broke before saving a hash", async () => {
  mocks.relay.mockRejectedValue(new Error("rpc down"));
  mocks.referral.mockResolvedValueOnce(null).mockResolvedValueOnce({ armTxHash: null });
  const response = await claim();
  expect(response.status).toBe(502);
  expect(mocks.update.mock.calls.at(-1)?.[0].data).toEqual({ status: "FAILED" });
});

it("rejects a bad signature first", async () => {
  mocks.verify.mockResolvedValue("invalid_signature");
  expect((await claim()).status).toBe(401);
  expect(mocks.profile).not.toHaveBeenCalled();
});
