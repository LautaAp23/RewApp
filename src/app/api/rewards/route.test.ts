import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ catalog: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { platformReward: { findMany: mocks.catalog } },
}));
vi.mock("@/lib/server/chain", () => ({
  publicClient: { readContract: mocks.read },
}));
vi.mock("@/lib/contracts", async () => {
  const actual = await vi.importActual<object>("@/lib/contracts");
  return {
    ...actual,
    contractAddresses: {
      rewAppPay: "0x3333333333333333333333333333333333333333",
    },
  };
});
import { GET } from "./route";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.catalog.mockResolvedValue([
    {
      id: 1,
      title: "Coffee",
      description: "Pickup",
      merchant: { name: "Cafe" },
      pointsCost: 300,
    },
  ]);
});
it("uses the deployed Reward struct order and authoritative point cost", async () => {
  mocks.read.mockResolvedValue([350n, 0, true, true]);
  const response = await GET();
  const { rewards } = await response.json();
  expect(rewards[0].pointsCost).toBe("350");
  expect(rewards[0].available).toBe(true);
});
it.each([
  [300n, 1, true, true],
  [300n, 0, false, true],
  [300n, 0, true, false],
])(
  "disables non-customer, inactive or missing chain rewards",
  async (pointsCost, audience, active, exists) => {
    mocks.read.mockResolvedValue([pointsCost, audience, active, exists]);
    expect((await (await GET()).json()).rewards[0].available).toBe(false);
  },
);
it("fails closed when chain reads are unavailable", async () => {
  mocks.read.mockRejectedValue(new Error("offline"));
  const { rewards } = await (await GET()).json();
  expect(rewards[0].available).toBe(false);
});
