import { describe, expect, it, vi } from "vitest";
import { createGasGuard, MIN_RELAYER_WEI, RelayerOutOfGasError } from "./relayer-gas";

function guardWith(balances: bigint[], clock = { t: 0 }) {
  const readBalance = vi.fn(async () => balances.shift() ?? 0n);
  const guard = createGasGuard({ readBalance, cacheMs: 30_000, now: () => clock.t });
  return { guard, readBalance, clock };
}

describe("createGasGuard", () => {
  it("deja pasar con saldo suficiente", async () => {
    const { guard } = guardWith([MIN_RELAYER_WEI * 10n]);
    await expect(guard()).resolves.toBeUndefined();
  });

  it("corta con saldo por debajo del umbral", async () => {
    const { guard } = guardWith([MIN_RELAYER_WEI - 1n]);
    await expect(guard()).rejects.toBeInstanceOf(RelayerOutOfGasError);
  });

  // Review Focus 3: el borde exacto pasa. Un >= y no un >.
  it("deja pasar con el saldo exactamente en el umbral", async () => {
    const { guard } = guardWith([MIN_RELAYER_WEI]);
    await expect(guard()).resolves.toBeUndefined();
  });

  // Review Focus 4: dos pagos seguidos no suman dos lecturas al RPC.
  it("no vuelve a leer el saldo dentro de la ventana de caché", async () => {
    const { guard, readBalance, clock } = guardWith([MIN_RELAYER_WEI * 10n]);
    await guard();
    clock.t = 29_999;
    await guard();
    expect(readBalance).toHaveBeenCalledTimes(1);
  });

  it("vuelve a leer el saldo cuando la caché expiró", async () => {
    const { guard, readBalance, clock } = guardWith([MIN_RELAYER_WEI * 10n, MIN_RELAYER_WEI - 1n]);
    await guard();
    clock.t = 30_000;
    await expect(guard()).rejects.toBeInstanceOf(RelayerOutOfGasError);
    expect(readBalance).toHaveBeenCalledTimes(2);
  });

  it("sigue cortando dentro de la ventana después de un saldo insuficiente", async () => {
    const { guard, readBalance, clock } = guardWith([MIN_RELAYER_WEI - 1n]);
    await expect(guard()).rejects.toBeInstanceOf(RelayerOutOfGasError);
    clock.t = 10_000;
    await expect(guard()).rejects.toBeInstanceOf(RelayerOutOfGasError);
    expect(readBalance).toHaveBeenCalledTimes(1);
  });
});
