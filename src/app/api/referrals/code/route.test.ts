import { beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), find: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { profile: { findUnique: mocks.find, updateMany: mocks.updateMany } } }));
vi.mock("@/lib/api/signed-request", () => ({ verifySignedRequest: mocks.verify }));
import { POST } from "./route";

const account = "0x1111111111111111111111111111111111111111";
const post = (body: unknown) => POST(new Request("http://localhost/api/referrals/code", { method: "POST", body: JSON.stringify(body) }));
const signed = { account, deadline: "1800000000", signature: "0x1234" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.verify.mockResolvedValue("ok");
});

it("returns the existing code without writing", async () => {
  mocks.find.mockResolvedValue({ alias: "Ana", referralCode: "ana-7k2q" });
  const response = await post(signed);
  expect(await response.json()).toEqual({ code: "ana-7k2q" });
  expect(mocks.updateMany).not.toHaveBeenCalled();
});

it("creates a code from the alias only where none exists yet", async () => {
  mocks.find.mockResolvedValue({ alias: "Ana", referralCode: null });
  mocks.updateMany.mockResolvedValue({ count: 1 });
  const response = await post(signed);
  const { code } = await response.json();
  expect(code).toMatch(/^ana-[2-9a-hjkmnp-z]{4}$/);
  expect(mocks.updateMany.mock.calls[0][0].where).toEqual({ address: account, referralCode: null });
});

it("returns the code a concurrent request already set", async () => {
  mocks.find.mockResolvedValueOnce({ alias: "Ana", referralCode: null }).mockResolvedValueOnce({ referralCode: "ana-zzzz" });
  mocks.updateMany.mockResolvedValue({ count: 0 });
  expect(await (await post(signed)).json()).toEqual({ code: "ana-zzzz" });
});

it("retries on a unique collision", async () => {
  mocks.find.mockResolvedValue({ alias: "Ana", referralCode: null });
  mocks.updateMany
    .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }))
    .mockResolvedValueOnce({ count: 1 });
  expect((await post(signed)).status).toBe(200);
  expect(mocks.updateMany).toHaveBeenCalledTimes(2);
});

it("asks for a profile first", async () => {
  mocks.find.mockResolvedValue(null);
  const response = await post(signed);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "profile_required" });
});

it("rejects a bad signature before reading anything", async () => {
  mocks.verify.mockResolvedValue("invalid_signature");
  expect((await post(signed)).status).toBe(401);
  expect(mocks.find).not.toHaveBeenCalled();
});
