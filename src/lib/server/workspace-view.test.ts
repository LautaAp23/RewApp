import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const dbMocks = vi.hoisted(() => ({
  contact: vi.fn(),
  socialGroup: vi.fn(),
  charge: vi.fn(),
  redemption: vi.fn(),
  platformReward: vi.fn(),
  merchant: vi.fn(),
  profile: vi.fn(),
  personalCharge: vi.fn(),
  contactProfiles: vi.fn(),
  blocks: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    contact: { findMany: dbMocks.contact },
    socialGroup: { findMany: dbMocks.socialGroup },
    charge: { findMany: dbMocks.charge },
    redemption: { findMany: dbMocks.redemption },
    platformReward: { findMany: dbMocks.platformReward },
    merchant: { findFirst: dbMocks.merchant },
    profile: {
      findUnique: dbMocks.profile,
      findMany: dbMocks.contactProfiles,
    },
    personalCharge: { findMany: dbMocks.personalCharge },
    paymentRequestBlock: { findMany: dbMocks.blocks },
  },
}));

import { workspaceView } from "./workspace";

const owner = "0x1111111111111111111111111111111111111111";
const merchantAddress = "0x2222222222222222222222222222222222222222";

function redemptionRow(account: string) {
  return {
    id: `red-${account.slice(2, 6)}`,
    account,
    title: "Premio comercio 101",
    status: "READY",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    deliveredAt: null,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  dbMocks.contact.mockResolvedValue([]);
  dbMocks.socialGroup.mockResolvedValue([]);
  dbMocks.charge.mockResolvedValue([]);
  dbMocks.platformReward.mockResolvedValue([]);
  dbMocks.profile.mockResolvedValue(null);
  dbMocks.personalCharge.mockResolvedValue([]);
  dbMocks.contactProfiles.mockResolvedValue([]);
  dbMocks.blocks.mockResolvedValue([]);
  dbMocks.redemption.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    if (where.account === merchantAddress) return [redemptionRow(merchantAddress)];
    return [];
  });
});

it("expone los canjes propios del comercio cuando hay foco en su comercio", async () => {
  dbMocks.merchant.mockResolvedValue({
    id: "merchant-1",
    name: "Café Demo",
    address: merchantAddress,
    derivationIndex: 1,
  });
  const view = await workspaceView(owner, merchantAddress);
  expect(view.merchant?.id).toBe("merchant-1");
  expect(view.commerceRedemptions).toHaveLength(1);
  expect(view.commerceRedemptions[0].account).toBe(merchantAddress);
  const commerceCall = dbMocks.redemption.mock.calls.find((call) => {
    const args = call[0] as { where: Record<string, unknown> };
    return args.where.account === merchantAddress;
  });
  expect(commerceCall).toBeDefined();
});

it("devuelve historial de comercio vacío sin foco en comercio", async () => {
  const view = await workspaceView(owner, null);
  expect(view.merchant).toBeNull();
  expect(view.commerceRedemptions).toEqual([]);
});
