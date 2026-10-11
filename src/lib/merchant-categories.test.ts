import { describe, expect, it } from "vitest";
import { categoryFromOsm, isMerchantCategory, MERCHANT_CATEGORIES } from "./merchant-categories";

describe("rubros del comercio", () => {
  it("conserva los rubros que ya están guardados en la base", () => {
    // seed_demo_merchants guardó 'cafe' y 'restaurant': tienen que seguir siendo válidos.
    expect(isMerchantCategory("cafe")).toBe(true);
    expect(isMerchantCategory("restaurant")).toBe(true);
    expect(MERCHANT_CATEGORIES).toHaveLength(8);
  });

  it("mapea los valores de OSM a la lista cerrada", () => {
    expect(categoryFromOsm("cafe")).toBe("cafe");
    expect(categoryFromOsm("bakery")).toBe("bakery");
    expect(categoryFromOsm("fast_food")).toBe("restaurant");
    expect(categoryFromOsm("kiosk")).toBe("convenience");
    expect(categoryFromOsm("supermarket")).toBe("grocery");
    expect(categoryFromOsm("pharmacy")).toBe("pharmacy");
  });

  it("lo que no conoce cae en otro, nunca en undefined", () => {
    expect(categoryFromOsm("nightclub")).toBe("other");
    expect(categoryFromOsm(undefined)).toBe("other");
    expect(categoryFromOsm("")).toBe("other");
  });

  it("rechaza un rubro inventado", () => {
    expect(isMerchantCategory("casino")).toBe(false);
    expect(isMerchantCategory(42)).toBe(false);
  });
});
