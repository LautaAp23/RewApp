import { describe, expect, it } from "vitest";
import { planHandover } from "./admin-handover.mjs";

const state = (overrides = {}) => ({
  newAdmin: "0xNEW",
  oldAdmin: "0xOLD",
  contracts: [
    { name: "USDr", address: "0x1", newIsAdmin: false, oldIsAdmin: true },
    { name: "RewAppPay", address: "0x2", newIsAdmin: false, oldIsAdmin: true },
    { name: "RewAppPay vieja", address: "0x3", newIsAdmin: false, oldIsAdmin: true },
  ],
  ...overrides,
});

describe("planHandover", () => {
  it("otorga el rol en cada contrato donde la cuenta nueva todavía no lo tiene", () => {
    expect(planHandover(state(), { revoke: false }).map((step) => step.action)).toEqual(["grant", "grant", "grant"]);
  });

  it("no vuelve a otorgar donde la cuenta nueva ya es admin", () => {
    const current = state();
    current.contracts[0].newIsAdmin = true;
    const plan = planHandover(current, { revoke: false });
    expect(plan[0]).toMatchObject({ name: "USDr", action: "skip" });
    expect(plan.filter((step) => step.action === "grant")).toHaveLength(2);
  });

  // Tarjeta #80: al revés deja a todos afuera y sin vuelta atrás.
  it("se niega a revocar mientras la cuenta nueva no sea admin en los tres", () => {
    const current = state();
    current.contracts[0].newIsAdmin = true;
    expect(() => planHandover(current, { revoke: true })).toThrow(/RewAppPay/);
  });

  it("revoca a la cuenta vieja solo cuando la nueva ya tiene el rol en los tres", () => {
    const current = state();
    for (const contract of current.contracts) contract.newIsAdmin = true;
    expect(planHandover(current, { revoke: true }).map((step) => step.action)).toEqual(["revoke", "revoke", "revoke"]);
  });

  it("marca como terminado el contrato donde la vieja ya no es admin", () => {
    const current = state();
    for (const contract of current.contracts) contract.newIsAdmin = true;
    current.contracts[2].oldIsAdmin = false;
    expect(planHandover(current, { revoke: true })[2]).toMatchObject({ action: "done" });
  });

  it("se niega si la cuenta nueva es la misma que la vieja", () => {
    expect(() => planHandover(state({ newAdmin: "0xold" }), { revoke: false })).toThrow(/misma/);
  });
});
