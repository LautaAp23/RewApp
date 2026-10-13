import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ verify: vi.fn(), session: vi.fn(), personalRead: vi.fn(), personalRows: vi.fn(), splitRead: vi.fn(), splitRows: vi.fn(), blocks: vi.fn() }));
vi.mock("@/lib/api/signed-request", () => ({ verifySignedRequest: mocks.verify }));
vi.mock("@/lib/server/workspace-auth", () => ({ ensureWorkspaceSession: mocks.session }));
vi.mock("@/lib/server/personal-view", () => ({ personalView: (row: unknown) => row }));
vi.mock("@/lib/db", () => ({ db: { personalCharge: { updateMany: mocks.personalRead, findMany: mocks.personalRows }, charge: { updateMany: mocks.splitRead, findMany: mocks.splitRows }, paymentRequestBlock: { findMany: mocks.blocks } } }));
import { POST } from "./route";
const account = "0x1111111111111111111111111111111111111111", uuid = "12345678-1234-1234-1234-123456789abc";
const request = (ids: unknown = []) => new Request("http://localhost:3000/api/personal/inbox", { method: "POST", headers: { origin: "http://localhost:3000", "Content-Type": "application/json" }, body: JSON.stringify({ account, deadline: "9999999999", signature: "0x1234", payload: JSON.stringify(ids) }) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.verify.mockResolvedValue("ok"); mocks.blocks.mockResolvedValue([]); mocks.personalRows.mockResolvedValue([]); mocks.splitRows.mockResolvedValue([]);
});
describe("private personal and split payment inbox", () => {
  it("opening the inbox only reads assigned, pending, unexpired subcharges", async () => {
    mocks.splitRows.mockResolvedValue([{ id: "part", merchant: { name: "Cafe" }, localCurrency: "ARS", localAmount: { toFixed: () => "1250.00" }, notificationReadAt: null }]);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.splitRows.mock.calls[0][0].where).toEqual({ expectedPayer: account, parentId: { not: null }, status: "PENDING", expiresAt: { gt: expect.any(Date) } });
    expect(await response.json()).toEqual({ charges: [], splits: [{ id: "part", merchantName: "Cafe", localCurrency: "ARS", localAmount: "1250.00", readAt: null }] });
    expect(mocks.personalRead).not.toHaveBeenCalled(); expect(mocks.splitRead).not.toHaveBeenCalled();
  });
  it("acknowledges only the tapped share owned by the signer, excluding parent charges", async () => {
    await POST(request(["split:part"]));
    expect(mocks.splitRead).toHaveBeenCalledWith({ where: { expectedPayer: account, parentId: { not: null }, id: { in: ["part"] }, notificationReadAt: null }, data: { notificationReadAt: expect.any(Date) } });
    expect(mocks.personalRead).not.toHaveBeenCalled();
  });
  it("keeps personal and split acknowledgements separate", async () => {
    await POST(request([uuid, "split:part"]));
    expect(mocks.personalRead.mock.calls[0][0].where.id.in).toEqual([uuid]);
    expect(mocks.splitRead.mock.calls[0][0].where.id.in).toEqual(["part"]);
    expect(mocks.personalRead.mock.calls[0][0].where.expectedPayer).toBe(account);
  });
  it("returns the persisted read timestamp across sessions", async () => {
    mocks.splitRows.mockResolvedValue([{ id: "part", merchant: { name: "Cafe" }, localCurrency: "USD", localAmount: { toFixed: () => "2.00" }, notificationReadAt: new Date("2026-10-12T00:00:00Z") }]);
    const result = await (await POST(request())).json();
    expect(result.splits[0].readAt).toBe("2026-10-12T00:00:00.000Z");
  });
  it("rejects unsigned requests and invalid acknowledgement ids without writing", async () => {
    mocks.verify.mockResolvedValue("invalid"); expect((await POST(request(["split:part"]))).status).toBe(401);
    mocks.verify.mockResolvedValue("ok"); expect((await POST(request(["split:../other"]))).status).toBe(400);
    expect(mocks.splitRead).not.toHaveBeenCalled(); expect(mocks.personalRead).not.toHaveBeenCalled();
  });
});
