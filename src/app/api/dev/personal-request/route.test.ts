import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ account: vi.fn(), transaction: vi.fn(), lock: vi.fn(), block: vi.fn(), count: vi.fn(), rate: vi.fn(), profile: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/server/workspace-auth", () => ({ workspaceAccount: mocks.account }));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));
import { POST } from "./route";
const account = "0x1111111111111111111111111111111111111111";
const request = (origin = "http://localhost:3000") => new Request("http://localhost:3000/api/dev/personal-request", { method: "POST", headers: { origin } });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", "10143"); vi.stubEnv("DATABASE_URL", "postgresql://local:local@127.0.0.1:5434/test");
  mocks.account.mockResolvedValue(account); mocks.lock.mockResolvedValue([{ address: account }]);
  mocks.block.mockResolvedValue(null); mocks.count.mockResolvedValue(0); mocks.rate.mockResolvedValue({ usdRate: { toString: () => "1000" } });
  mocks.create.mockImplementation(async ({ data }) => data);
  mocks.transaction.mockImplementation(async work => work({ $queryRaw: mocks.lock, paymentRequestBlock: { findUnique: mocks.block }, personalCharge: { count: mocks.count, create: mocks.create }, profile: { upsert: mocks.profile }, fxRate: { findUnique: mocks.rate } }));
});
afterEach(() => vi.unstubAllEnvs());
describe("local incoming payment request fixture", () => {
  it.each([['NODE_ENV','production'],['NEXT_PUBLIC_CHAIN_ID','1'],['DATABASE_URL','postgresql://local:local@example.com/test']])("is unavailable with %s=%s", async (key,value) => {
    vi.stubEnv(key,value); expect((await POST(request())).status).toBe(404); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("requires same origin and an authenticated account", async () => {
    expect((await POST(request('https://example.com'))).status).toBe(403);
    mocks.account.mockResolvedValue(null); expect((await POST(request())).status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("creates a pending request from a different demo account to the signed-in user", async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    const row = mocks.create.mock.calls[0][0].data;
    expect(row).toMatchObject({ kind: "REQUEST", expectedPayer: account, localCurrency: "ARS", localAmount: "5000", usdAmount: 5000000n });
    expect(row.recipient).not.toBe(account); expect(row.payer).toBeUndefined(); expect(row.authorization).toBeUndefined(); expect(row.txHash).toBeUndefined();
  });
  it("respects request blocks and rate limits", async () => {
    mocks.block.mockResolvedValue({ owner: account });
    expect(await (await POST(request())).json()).toEqual({ error: "requests_blocked" });
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.block.mockResolvedValue(null); mocks.count.mockResolvedValue(5);
    expect(await (await POST(request())).json()).toEqual({ error: "too_many_requests" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
