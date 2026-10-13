import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  account: vi.fn(),
  updateMany: vi.fn(),
  profile: vi.fn(),
  rate: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/lib/server/charge-state", () => ({ refreshCharge: mocks.refresh }));
vi.mock("@/lib/server/workspace-auth", () => ({ workspaceAccount: mocks.account }));
vi.mock("@/lib/db", () => ({
  db: { charge: { updateMany: mocks.updateMany }, profile: { findUnique: mocks.profile } },
}));
vi.mock("@/lib/fx", () => ({ getUsdRate: mocks.rate }));
vi.mock("@/lib/server/chain", () => ({ publicClient: { readContract: mocks.read } }));
import { GET } from "./route";

const owner = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const payer = "0x3333333333333333333333333333333333333333";
const merchantKey = "0x4444444444444444444444444444444444444444";

function chargeFixture() {
  return {
    id: "charge-1",
    status: "PAID",
    expiresAt: new Date("2030-01-01T00:00:00Z"),
    merchantId: "merchant-1",
    localAmount: { toFixed: () => "3500.00" },
    localCurrency: "ARS",
    usdAmount: 3500000n,
    txHash: "0xabc",
    expectedPayer: null,
    parentId: null,
    payer,
    merchant: {
      name: "Demo",
      logoUrl: null,
      category: "cafe",
      address: merchantKey,
      ownerAddress: owner,
    },
  };
}

const request = () =>
  GET(new Request("http://localhost/api/charges/charge-1"), { params: Promise.resolve({ id: "charge-1" }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.refresh.mockResolvedValue(chargeFixture());
  mocks.profile.mockResolvedValue({ alias: "Ana", handle: null });
});

describe("GET /api/charges/[id] payer exposure", () => {
  it("returns payer and profile alias to the owner session", async () => {
    mocks.account.mockResolvedValue(owner);
    const response = await request();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.payer).toBe(payer);
    expect(body.payerName).toBe("Ana");
    expect(mocks.profile).toHaveBeenCalledWith({
      where: { address: payer },
      select: { alias: true, handle: true },
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("also recognizes the merchant key as an owner session", async () => {
    mocks.account.mockResolvedValue(merchantKey);
    const body = await (await request()).json();
    expect(body.payer).toBe(payer);
    expect(body.payerName).toBe("Ana");
  });

  it("falls back to @handle when the payer has no alias", async () => {
    mocks.account.mockResolvedValue(owner);
    mocks.profile.mockResolvedValue({ alias: null, handle: "ana" });
    const body = await (await request()).json();
    expect(body.payer).toBe(payer);
    expect(body.payerName).toBe("@ana");
  });

  it("never exposes the raw address as the payer name", async () => {
    // Without alias/handle there is no displayable name: the API returns null
    // and the till shows a generic localized label instead of 0x….
    mocks.account.mockResolvedValue(owner);
    mocks.profile.mockResolvedValue({ alias: null, handle: null });
    const withoutProfile = await (await request()).json();
    expect(withoutProfile.payer).toBe(payer);
    expect(withoutProfile.payerName).toBeNull();
    expect(withoutProfile.payerName).not.toBe(payer);
    mocks.profile.mockResolvedValue(null);
    const unknownPayer = await (await request()).json();
    expect(unknownPayer.payer).toBe(payer);
    expect(unknownPayer.payerName).toBeNull();
  });

  it("hides payer from a third-party session without changing the public 200", async () => {
    mocks.account.mockResolvedValue(other);
    const response = await request();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("PAID");
    expect(body.localAmount).toBe("3500.00");
    expect(body.payer).toBeNull();
    expect(body.payerName).toBeNull();
    expect(mocks.profile).not.toHaveBeenCalled();
  });

  it("hides payer from anonymous readers", async () => {
    mocks.account.mockResolvedValue(null);
    const body = await (await request()).json();
    expect(body.status).toBe("PAID");
    expect(body.payer).toBeNull();
    expect(body.payerName).toBeNull();
    expect(mocks.profile).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown charges", async () => {
    mocks.refresh.mockResolvedValue(null);
    expect((await request()).status).toBe(404);
  });
});
