import { expect, it } from "vitest";
import {
  isAppReward,
  isRaffleReward,
  nextInTab,
  sortByCost,
  splitCatalog,
  type CatalogReward,
} from "./rewards-catalog";

function reward(
  id: number,
  merchant: string | null,
  pointsCost = "300",
  available = true,
): CatalogReward {
  return {
    id,
    title: `Premio ${id}`,
    pointsCost,
    available,
    merchant: merchant ? { name: merchant } : null,
  };
}

it("manda el 90 a App y 1, 2, 3 a comercios", () => {
  const { app, merchant } = splitCatalog([
    reward(1, "Café Demo"),
    reward(2, "Bistro Demo"),
    reward(3, "Café Demo"),
    reward(90, null, "1"),
  ]);
  expect(app.map((r) => r.id)).toEqual([90]);
  expect(merchant.map((r) => r.id)).toEqual([1, 2, 3]);
  expect(isAppReward(reward(90, null))).toBe(true);
  expect(isAppReward(reward(1, "Café Demo"))).toBe(false);
});

it("calcula el progreso por pestaña sin mezclar orígenes", () => {
  const { app, merchant } = splitCatalog([
    reward(90, null, "1"),
    reward(1, "Café Demo", "300"),
    reward(2, "Bistro Demo", "500"),
  ]);
  expect(nextInTab(app, 50n).reachable?.id).toBe(90);
  expect(nextInTab(app, 50n).missing).toBeNull();
  expect(nextInTab(merchant, 50n).reachable).toBeNull();
  expect(nextInTab(merchant, 50n).missing?.id).toBe(1);
  expect(nextInTab(merchant, 400n).reachable?.id).toBe(1);
  expect(nextInTab(merchant, 400n).missing?.id).toBe(2);
});

it("ignora premios no disponibles o con costo inválido", () => {
  const rewards = [
    reward(1, "Café Demo", "300", false),
    { ...reward(2, "Bistro Demo", "500"), pointsCost: "no-numérico" },
  ];
  expect(nextInTab(rewards, 10000n)).toEqual({
    reachable: null,
    missing: null,
  });
  expect(nextInTab(rewards, undefined)).toEqual({
    reachable: null,
    missing: null,
  });
});

it("detecta el sorteo 201 y ordena el tab App por costo", () => {
  expect(isRaffleReward({ id: 201 })).toBe(true);
  expect(isRaffleReward({ id: 90 })).toBe(false);
  expect(isRaffleReward({ id: 1 })).toBe(false);
  const ordered = sortByCost([
    reward(203, null, "120000"),
    reward(90, null, "1"),
    reward(202, null, "8000"),
    reward(201, null, "100"),
  ]);
  expect(ordered.map((r) => r.id)).toEqual([90, 201, 202, 203]);
});
