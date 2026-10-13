import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, type Log } from "viem";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/contracts", async () => {
  const actual = await vi.importActual<object>("@/lib/contracts");
  return { ...actual, contractAddresses: { rewAppPay: "0x3333333333333333333333333333333333333333" } };
});
const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(), update: vi.fn(), profile: vi.fn(), receipt: vi.fn(), read: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    referral: { updateMany: mocks.updateMany, update: mocks.update },
    profile: { findUnique: mocks.profile },
  },
}));
vi.mock("@/lib/server/chain", () => ({
  publicClient: { getTransactionReceipt: mocks.receipt, readContract: mocks.read },
}));
import { contractAddresses, rewAppPayAbi } from "@/lib/contracts";
import { readReferralProgram, reconcileReferral, recordReferralReward } from "./referrals";

const referrer = "0x1111111111111111111111111111111111111111";
const referee = "0x2222222222222222222222222222222222222222";
const merchant = "0x4444444444444444444444444444444444444444";
const txHash = `0x${"aa".repeat(32)}` as const;

function rewarded(address = contractAddresses.rewAppPay!, referrerBonus = 200n, refereeBonus = 100n) {
  return {
    address,
    topics: encodeEventTopics({ abi: rewAppPayAbi, eventName: "ReferralRewarded", args: { referrer, referee, merchant } }),
    data: encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "uint256" }],
      [`0x${"cc".repeat(32)}`, referrerBonus, refereeBonus],
    ),
  } as unknown as Log;
}

const row = (overrides = {}) => ({
  referee, referrer, code: "ana-7k2q", status: "ARMING", armTxHash: txHash, expiresAt: null,
  rewardTxHash: null, referrerBonus: null, refereeBonus: null, ip: "1.1.1.1",
  createdAt: new Date("2026-10-13T12:00:00Z"), rewardedAt: null, ...overrides,
}) as never;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.update.mockImplementation(async ({ data }) => ({ ...(row() as object), ...data }));
});

describe("recordReferralReward", () => {
  it("marks the referral rewarded and returns what the payer earned with the referrer's alias", async () => {
    mocks.profile.mockResolvedValue({ alias: "Ana" });
    const result = await recordReferralReward([rewarded()], txHash);
    expect(result).toEqual({ refereeBonus: "100", referrerAlias: "Ana" });
    expect(mocks.updateMany.mock.calls[0][0]).toMatchObject({
      where: { referee },
      data: { status: "REWARDED", rewardTxHash: txHash, referrerBonus: "200", refereeBonus: "100" },
    });
  });
  it("ignores the same event from another contract", async () => {
    expect(await recordReferralReward([rewarded("0x9999999999999999999999999999999999999999")], txHash)).toBeNull();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("returns null when the payment carried no referral", async () => {
    expect(await recordReferralReward([], txHash)).toBeNull();
  });
});

describe("reconcileReferral", () => {
  it("keeps ARMING while the receipt is missing", async () => {
    mocks.receipt.mockRejectedValue(new Error("not mined"));
    expect((await reconcileReferral(row())).status).toBe("ARMING");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("moves a reverted arm to FAILED so it can be claimed again", async () => {
    mocks.receipt.mockResolvedValue({ status: "reverted", logs: [] });
    expect((await reconcileReferral(row())).status).toBe("FAILED");
  });
  it("moves a confirmed arm to ARMED with the contract's expiry", async () => {
    const expiresAt = 1_762_592_000n;
    mocks.receipt.mockResolvedValue({
      status: "success",
      logs: [{
        address: contractAddresses.rewAppPay,
        topics: encodeEventTopics({ abi: rewAppPayAbi, eventName: "ReferralSet", args: { referee, referrer } }),
        data: encodeAbiParameters([{ type: "uint64" }], [expiresAt]),
      }],
    });
    const result = await reconcileReferral(row());
    expect(result.status).toBe("ARMED");
    expect(mocks.update.mock.calls[0][0].data.expiresAt).toEqual(new Date(Number(expiresAt) * 1000));
  });
  it("fails an ARMING row that never got a hash after 10 minutes", async () => {
    const now = new Date("2026-10-13T12:11:00Z");
    expect((await reconcileReferral(row({ armTxHash: null }), now)).status).toBe("FAILED");
  });
  it("marks ARMED as REWARDED when the contract settled it outside /api/pay", async () => {
    mocks.read.mockResolvedValue([referrer, 1_762_592_000n, true]);
    expect((await reconcileReferral(row({ status: "ARMED" }))).status).toBe("REWARDED");
  });
  it("leaves REWARDED rows untouched", async () => {
    await reconcileReferral(row({ status: "REWARDED" }));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
});

describe("readReferralProgram", () => {
  it("reads the parameters from the contract", async () => {
    mocks.read.mockImplementation(async ({ functionName }: { functionName: string }) =>
      ({ referrerBonus: 200n, refereeBonus: 100n, referralMinAmount: 5_000_000n, referralWindow: 2_592_000n } as Record<string, bigint>)[functionName]);
    expect(await readReferralProgram()).toEqual({
      referrerBonus: "200", refereeBonus: "100", minAmount: "5000000", windowDays: 30, active: true,
    });
  });
  it("returns null when the chain cannot be read", async () => {
    mocks.read.mockRejectedValue(new Error("rpc down"));
    expect(await readReferralProgram()).toBeNull();
  });
});
