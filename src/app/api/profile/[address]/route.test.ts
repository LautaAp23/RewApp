import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), upsert: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { profile: { upsert: mocks.upsert, findUnique: mocks.findUnique } } }));
vi.mock("@/lib/api/signed-request", () => ({ verifySignedRequest: mocks.verify }));
import { PUT } from "./route";
const address = "0x1111111111111111111111111111111111111111";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.verify.mockResolvedValue("ok");
  mocks.findUnique.mockResolvedValue(null);
  mocks.upsert.mockResolvedValue({ address, alias: "Juan", email: "juan@example.com", country: "AR", currency: "ARS", birthDay: null, birthMonth: null });
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
it("stores the birthdate on first set and signs it", async () => {
  const response = await PUT(new Request("http://localhost/api/profile/" + address, {
    method: "PUT",
    body: JSON.stringify({ alias: "Juan", country: "AR", currency: "ARS", birthDay: "7", birthMonth: "3", deadline: "1800000000", signature: "0x1234" }),
  }), { params: Promise.resolve({ address }) });
  expect(response.status).toBe(200);
  expect(mocks.verify.mock.calls[0][0].message.birthDay).toBe("7");
  expect(mocks.upsert.mock.calls[0][0].create.birthDay).toBe(7);
  expect(mocks.upsert.mock.calls[0][0].create.birthMonth).toBe(3);
});
it("locks the birthdate once set", async () => {
  mocks.findUnique.mockResolvedValue({ birthDay: 7, birthMonth: 3 });
  const response = await PUT(new Request("http://localhost/api/profile/" + address, {
    method: "PUT",
    body: JSON.stringify({ alias: "Juan", country: "AR", currency: "ARS", birthDay: "8", birthMonth: "3", deadline: "1800000000", signature: "0x1234" }),
  }), { params: Promise.resolve({ address }) });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "birthdate_locked" });
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it("rejects an impossible birthdate", async () => {
  const response = await PUT(new Request("http://localhost/api/profile/" + address, {
    method: "PUT",
    body: JSON.stringify({ alias: "Juan", country: "AR", currency: "ARS", birthDay: "30", birthMonth: "2", deadline: "1800000000", signature: "0x1234" }),
  }), { params: Promise.resolve({ address }) });
  expect(response.status).toBe(400);
  expect(mocks.upsert).not.toHaveBeenCalled();
});
