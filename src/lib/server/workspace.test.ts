import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
import { workspaceMutation } from "./workspace";
const a = "0x1111111111111111111111111111111111111111",
  b = "0x2222222222222222222222222222222222222222",
  merchant = "0x3333333333333333333333333333333333333333";
const mock = {
  contact: { count: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  socialGroup: {
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  charge: { findUnique: vi.fn(), updateMany: vi.fn(), createMany: vi.fn() },
  merchant: { findUnique: vi.fn() },
  platformReward: { updateMany: vi.fn() },
  redemption: { updateMany: vi.fn() },
};
const tx = mock as unknown as Prisma.TransactionClient;
const original = {
  id: "bill",
  parentId: null,
  status: "PENDING",
  expiresAt: new Date(Date.now() + 60000),
  merchantId: "merchant",
  merchant: { address: merchant },
  localAmount: { toFixed: () => "10.01" },
  localCurrency: "ARS",
  usdAmount: 100001n,
};
beforeEach(() => {
  vi.resetAllMocks();
  mock.contact.count.mockResolvedValue(1);
  mock.charge.findUnique.mockResolvedValue(original);
  mock.charge.updateMany.mockResolvedValue({ count: 1 });
});
describe("workspace authorization and split persistence", () => {
  it("creates assigned subcharges whose sum equals the original in both currencies", async () => {
    await workspaceMutation(tx, a, "charge.split", {
      charge: "bill",
      members: [a, b],
    });
    const parts = mock.charge.createMany.mock.calls[0][0].data;
    expect(
      parts.map((p: { expectedPayer: string }) => p.expectedPayer),
    ).toEqual([a, b]);
    expect(parts.map((p: { localAmount: string }) => p.localAmount)).toEqual([
      "5.01",
      "5.00",
    ]);
    expect(
      parts.reduce(
        (sum: bigint, p: { usdAmount: bigint }) => sum + p.usdAmount,
        0n,
      ),
    ).toBe(original.usdAmount);
    expect(mock.charge.updateMany.mock.calls[0][0].where.status).toBe(
      "PENDING",
    );
  });
  it("does not create shares when payment wins the reservation race", async () => {
    mock.charge.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      workspaceMutation(tx, a, "charge.split", {
        charge: "bill",
        members: [a, b],
      }),
    ).rejects.toThrow("charge_unavailable");
    expect(mock.charge.createMany).not.toHaveBeenCalled();
  });
  it.each(["PROCESSING", "PAID", "SPLIT", "EXPIRED"])(
    "cannot split a %s bill",
    async (status) => {
      mock.charge.findUnique.mockResolvedValue({ ...original, status });
      await expect(
        workspaceMutation(tx, a, "charge.split", {
          charge: "bill",
          members: [a, b],
        }),
      ).rejects.toThrow();
      expect(mock.charge.createMany).not.toHaveBeenCalled();
    },
  );
  it("rejects subcharges and expired bills", async () => {
    mock.charge.findUnique.mockResolvedValue({
      ...original,
      parentId: "parent",
    });
    await expect(
      workspaceMutation(tx, a, "charge.split", {
        charge: "bill",
        members: [a, b],
      }),
    ).rejects.toThrow();
    mock.charge.findUnique.mockResolvedValue({
      ...original,
      expiresAt: new Date(0),
    });
    await expect(
      workspaceMutation(tx, a, "charge.split", {
        charge: "bill",
        members: [a, b],
      }),
    ).rejects.toThrow();
  });
  it("rejects strangers and another owner's group", async () => {
    mock.contact.count.mockResolvedValue(0);
    await expect(
      workspaceMutation(tx, a, "charge.split", {
        charge: "bill",
        members: [a, b],
      }),
    ).rejects.toThrow("unknown_contact");
    mock.contact.count.mockResolvedValue(1);
    mock.socialGroup.findFirst.mockResolvedValue(null);
    await expect(
      workspaceMutation(tx, a, "charge.split", {
        charge: "bill",
        members: [a, b],
        groupId: "other",
      }),
    ).rejects.toThrow("invalid_group");
  });
  it("limits reward edits to the authenticated merchant and keeps point costs unchanged", async () => {
    mock.merchant.findUnique.mockResolvedValue({ id: "mine" });
    mock.platformReward.updateMany.mockResolvedValue({ count: 1 });
    await workspaceMutation(tx, a, "reward.update", {
      id: 1,
      title: "Coffee",
      description: "Pickup",
      active: true,
      pointsCost: 1,
    });
    const update = mock.platformReward.updateMany.mock.calls[0][0];
    expect(update.where.merchantId).toBe("mine");
    expect(update.data).not.toHaveProperty("pointsCost");
  });
  it("fulfills only confirmed rewards belonging to the merchant, once", async () => {
    mock.merchant.findUnique.mockResolvedValue({ id: "mine" });
    mock.redemption.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      workspaceMutation(tx, a, "redemption.deliver", { pickupCode: "code" }),
    ).rejects.toThrow("not_ready");
    expect(mock.redemption.updateMany.mock.calls[0][0].where).toEqual({
      pickupCode: "code",
      merchantId: "mine",
      status: "READY",
    });
  });
  it("cannot manage merchant rewards without a registered merchant account", async () => {
    mock.merchant.findUnique.mockResolvedValue(null);
    await expect(workspaceMutation(tx, a, "reward.update", {})).rejects.toThrow(
      "not_merchant",
    );
  });
});
