import { describe, expect, it } from "vitest";
import { nextDerivationIndex } from "./merchant-index";

describe("índice de comercios", () => {
  it("el primero usa el camino histórico", () => {
    expect(nextDerivationIndex([])).toBe(0);
  });

  it("salta los índices ya usados, aunque falte el cero", () => {
    expect(nextDerivationIndex([0, 2])).toBe(1);
    expect(nextDerivationIndex([null, undefined, 0])).toBe(1);
  });

  it("no pasa de diez comercios por perfil", () => {
    expect(nextDerivationIndex([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])).toBeNull();
  });
});
