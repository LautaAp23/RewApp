import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ account: vi.fn(), contact: vi.fn(), charges: vi.fn(), view: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { contact: { findFirst: mocks.contact }, personalCharge: { findMany: mocks.charges } } }));
vi.mock("@/lib/server/workspace-auth", () => ({ workspaceAccount: mocks.account }));
vi.mock("@/lib/server/personal-view", () => ({ personalView: mocks.view }));
import { GET } from "./route";
const owner = "0x1111111111111111111111111111111111111111", other = "0x2222222222222222222222222222222222222222";
const request = () => GET(new Request("http://localhost/api/contacts/contact"), { params: Promise.resolve({ id: "contact" }) });
beforeEach(() => { vi.resetAllMocks(); mocks.account.mockResolvedValue(owner); });
describe("private contact history", () => {
  it("requires an authenticated session", async () => {
    mocks.account.mockResolvedValue(null);
    expect((await request()).status).toBe(401);
    expect(mocks.contact).not.toHaveBeenCalled();
  });
  it("rejects a contact outside the current account without disclosing history", async () => {
    mocks.contact.mockResolvedValue(null);
    expect((await request()).status).toBe(404);
    expect(mocks.contact).toHaveBeenCalledWith({ where: { id: "contact", owner } });
    expect(mocks.charges).not.toHaveBeenCalled();
  });
  it("returns only confirmed payments between the two accounts", async () => {
    mocks.contact.mockResolvedValue({ address: other });
    mocks.charges.mockResolvedValue([{ id: "paid" }]);
    mocks.view.mockReturnValue({ id: "paid" });
    const response = await request();
    expect(response.status).toBe(200);
    expect(mocks.charges).toHaveBeenCalledWith({ where: { status: "PAID", OR: [{ payer: owner, recipient: other }, { payer: other, recipient: owner }] }, orderBy: { paidAt: "desc" }, take: 30 });
    expect(await response.json()).toEqual({ movements: [{ id: "paid" }] });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
