import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRoles } from "./roles";

const person = "0x37566338ADFbf56aa41FE8FC38aA92dB1e12aD59" as const;
const merchant = "0x85DB1c10e736fd49e8A3C4e96C59b1Fa77E82e30" as const;

function mockFetch(body: unknown, ok = true) {
  const spy = vi.fn().mockResolvedValue({ ok, json: async () => body });
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe("resolución de roles", () => {
  it("pide las dos direcciones en una sola consulta", async () => {
    const spy = mockFetch({ profile: null, merchant: null });
    await fetchRoles({ person, merchant });
    expect(spy).toHaveBeenCalledTimes(1);
    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain(`person=${person}`);
    expect(url).toContain(`merchant=${merchant}`);
  });

  it("una cuenta nueva no tiene ningún rol", async () => {
    mockFetch({ profile: null, merchant: null });
    expect(await fetchRoles({ person, merchant })).toEqual({ hasProfile: false, merchant: null });
  });

  it("reconoce a quien ya tiene perfil y comercio", async () => {
    mockFetch({
      profile: { address: person, alias: "Ana", hasEmail: true },
      merchant: { address: merchant, name: "Café Ana" },
    });
    const roles = await fetchRoles({ person, merchant });
    expect(roles.hasProfile).toBe(true);
    expect(roles.merchant?.name).toBe("Café Ana");
  });

  it("si la consulta falla asume que no hay roles, sin romper el ingreso", async () => {
    mockFetch({}, false);
    expect(await fetchRoles({ person, merchant })).toEqual({ hasProfile: false, merchant: null });
  });
});
