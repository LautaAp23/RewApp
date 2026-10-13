import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  reward: vi.fn(),
  redemption: vi.fn(),
  redemptionCount: vi.fn(),
  redemptionRecent: vi.fn(),
  read: vi.fn(),
  simulate: vi.fn(),
  verify: vi.fn(),
  funded: vi.fn(),
  revert: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    platformReward: { findUnique: mocks.reward },
    redemption: {
      findUnique: mocks.redemption,
      findFirst: mocks.redemptionRecent,
      count: mocks.redemptionCount,
    },
  },
}));

vi.mock("@/lib/server/chain", () => ({
  publicClient: {
    chain: { id: 10143 },
    readContract: mocks.read,
    simulateContract: mocks.simulate,
  },
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

vi.mock("@/lib/server/relayer", () => ({
  assertRelayerFunded: mocks.funded,
  getRelayer: () => ({
    account: "0x9999999999999999999999999999999999999999",
  }),
}));

vi.mock("@/lib/server/revert", () => ({ revertCode: mocks.revert }));

vi.mock("viem", async () => {
  const actual = await vi.importActual<object>("viem");
  return { ...actual, verifyTypedData: mocks.verify };
});

import { POST } from "./route";

const customer = "0x1111111111111111111111111111111111111111";
const merchant = "0x2222222222222222222222222222222222222222";

function body(account: string, rewardId: number) {
  return {
    intent: {
      account,
      rewardId: String(rewardId),
      nonce: "1",
      deadline: String(Math.floor(Date.now() / 1000) + 300),
    },
    signature:
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab1c",
  };
}

const request = (account: string, rewardId: number) =>
  new Request("http://localhost/api/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body(account, rewardId)),
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.funded.mockResolvedValue(undefined);
  mocks.verify.mockResolvedValue(true);
  mocks.redemption.mockResolvedValue(null);
  mocks.revert.mockReturnValue("reward_unavailable");
});

it("rechaza al cliente que intenta un premio COMMERCE sin quemar puntos", async () => {
  mocks.reward.mockResolvedValue({
    id: 101,
    audience: "COMMERCE",
    active: true,
    title: "Premio comercio",
    merchantId: null,
  });
  mocks.read.mockResolvedValue(false);
  const response = await POST(request(customer, 101));
  expect(response.status).toBe(400);
  expect((await response.json()).error).toBe("reward_unavailable");
  expect(mocks.verify).not.toHaveBeenCalled();
  expect(mocks.simulate).not.toHaveBeenCalled();
});

it("deja pasar al comercio hacia la simulación del premio COMMERCE", async () => {
  mocks.reward.mockResolvedValue({
    id: 101,
    audience: "COMMERCE",
    active: true,
    title: "Premio comercio",
    merchantId: null,
  });
  mocks.read.mockImplementation(async ({ functionName }: { functionName: string }) =>
    functionName === "isMerchant" ? true : [2000n, 1, true, true],
  );
  mocks.simulate.mockRejectedValue(new Error("revierte"));
  const response = await POST(request(merchant, 101));
  expect(mocks.verify).toHaveBeenCalled();
  expect(mocks.simulate).toHaveBeenCalled();
  expect((await response.json()).error).toBe("reward_unavailable");
});

it("la audiencia cruzada del comercio contra CUSTOMER vuelve como no disponible", async () => {
  mocks.reward.mockResolvedValue({
    id: 1,
    audience: "CUSTOMER",
    active: true,
    title: "Café",
    merchantId: "demo-cafe-ars",
  });
  mocks.simulate.mockRejectedValue(new Error("WrongAudience"));
  const response = await POST(request(merchant, 1));
  expect(response.status).toBe(400);
  expect((await response.json()).error).toBe("reward_unavailable");
});

it("rechaza la sexta participación en el sorteo sin quemar puntos", async () => {
  mocks.reward.mockResolvedValue({
    id: 201,
    audience: "CUSTOMER",
    active: true,
    title: "Sorteo de 1000 RewPoints",
    merchantId: null,
  });
  mocks.redemptionCount.mockResolvedValue(5);
  const response = await POST(request(customer, 201));
  expect(response.status).toBe(409);
  expect((await response.json()).error).toBe("raffle_limit_reached");
  expect(mocks.redemptionCount).toHaveBeenCalledWith({
    where: { account: customer, rewardId: 201, status: { not: "FAILED" } },
  });
  expect(mocks.simulate).not.toHaveBeenCalled();
});

it("deja participar por debajo del tope del sorteo", async () => {
  mocks.reward.mockResolvedValue({
    id: 201,
    audience: "CUSTOMER",
    active: true,
    title: "Sorteo de 1000 RewPoints",
    merchantId: null,
  });
  mocks.redemptionCount.mockResolvedValue(4);
  mocks.simulate.mockRejectedValue(new Error("revierte"));
  const response = await POST(request(customer, 201));
  expect(mocks.simulate).toHaveBeenCalled();
  expect((await response.json()).error).not.toBe("raffle_limit_reached");
});
