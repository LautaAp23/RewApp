import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics } from "viem";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/contracts", async () => {
  const actual = await vi.importActual<object>("@/lib/contracts");
  return {
    ...actual,
    contractAddresses: {
      rewAppPay: "0x3333333333333333333333333333333333333333",
    },
  };
});
const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  update: vi.fn(),
  receipt: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: { redemption: { findUnique: mocks.find, update: mocks.update } },
}));
vi.mock("@/lib/server/chain", () => ({
  publicClient: { getTransactionReceipt: mocks.receipt },
}));
import { contractAddresses, rewAppPayAbi } from "@/lib/contracts";
import { reconcileRedemption } from "./redemptions";
const account = "0x1111111111111111111111111111111111111111";
const item = {
  id: "redeem",
  account,
  rewardId: 1,
  nonce: "7",
  status: "PROCESSING",
  txHash: "0x" + "aa".repeat(32),
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.find.mockResolvedValue(item);
  mocks.update.mockImplementation(async ({ data }) => ({ ...item, ...data }));
});
describe("redemption confirmation", () => {
  it("does not expose a pickup while a receipt is missing", async () => {
    mocks.receipt.mockRejectedValue(new Error("not yet mined"));
    expect((await reconcileRedemption(item.id))?.status).toBe("PROCESSING");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("marks a reverted transaction failed and releases its unchanged chain nonce for retry", async () => {
    mocks.receipt.mockResolvedValue({ status: "reverted", logs: [] });
    expect((await reconcileRedemption(item.id))?.status).toBe("FAILED");
    expect(mocks.update.mock.calls[0][0].data.nonce).toContain(":failed:");
  });
  it("requires the deployed contract's matching account and reward event", async () => {
    mocks.receipt.mockResolvedValue({ status: "success", logs: [] });
    expect((await reconcileRedemption(item.id))?.status).toBe("FAILED");
  });
  it("confirms a matching event and records the actual cost", async () => {
    mocks.receipt.mockResolvedValue({
      status: "success",
      logs: [
        {
          address: contractAddresses.rewAppPay,
          topics: encodeEventTopics({
            abi: rewAppPayAbi,
            eventName: "RewardRedeemed",
            args: { account, rewardId: 1n },
          }),
          data: encodeAbiParameters(
            [{ type: "uint8" }, { type: "uint256" }],
            [0, 350n],
          ),
        },
      ],
    });
    const result = await reconcileRedemption(item.id);
    expect(result?.status).toBe("READY");
    expect(result?.pointsCost).toBe(350);
  });
});
