import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { profile: { upsert: mocks.upsert } } }));
vi.mock("@/lib/api/signed-request", () => ({ verifySignedRequest: mocks.verify }));
import { PUT } from "./route";
const address = "0x1111111111111111111111111111111111111111";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.verify.mockResolvedValue("ok");
  mocks.upsert.mockResolvedValue({ address, alias: "Juan", email: "juan@example.com", country: "AR", currency: "ARS" });
});
it.each([undefined, "", "new@example.com"])("handles profile edits with email %s", async (email) => {
  const response = await PUT(new Request("http://localhost/api/profile/" + address, {
    method: "PUT",
    body: JSON.stringify({ alias: "Juan", email, country: "AR", currency: "ARS", deadline: "1800000000", signature: "0x1234" }),
  }), { params: Promise.resolve({ address }) });
  expect(response.status).toBe(200);
  expect(mocks.verify.mock.calls[0][0].message.email).toBe(email ?? "");
  expect(mocks.upsert.mock.calls[0][0].update.email).toBe(email === undefined ? undefined : email || null);
  expect(await response.json()).not.toHaveProperty("email");
});
it("rejects an invalid signature before updating the profile", async () => {
  mocks.verify.mockResolvedValue("invalid_signature");
  const response = await PUT(new Request("http://localhost/api/profile/" + address, {
    method: "PUT",
    body: JSON.stringify({ alias: "Juan", country: "AR", currency: "ARS", deadline: "1800000000", signature: "0x1234" }),
  }), { params: Promise.resolve({ address }) });
  expect(response.status).toBe(401);
  expect(mocks.upsert).not.toHaveBeenCalled();
});
