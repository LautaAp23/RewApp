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

  // Hallazgo 6 de la revisión: el negativo NO se cachea. Si se recarga el
  // relayer, el pago siguiente pasa sin esperar a que venza la ventana.
  it("vuelve a leer el saldo en cada intento mientras no hay fondos", async () => {
    const { guard, readBalance, clock } = guardWith([MIN_RELAYER_WEI - 1n, MIN_RELAYER_WEI - 1n]);
    await expect(guard()).rejects.toBeInstanceOf(RelayerOutOfGasError);
    clock.t = 10_000;
    await expect(guard()).rejects.toBeInstanceOf(RelayerOutOfGasError);
    expect(readBalance).toHaveBeenCalledTimes(2);
  });

  it("deja pasar en cuanto el saldo se recupera, sin esperar a que venza la ventana", async () => {
    const { guard, clock } = guardWith([MIN_RELAYER_WEI - 1n, MIN_RELAYER_WEI * 10n]);
    await expect(guard()).rejects.toBeInstanceOf(RelayerOutOfGasError);
    clock.t = 1_000;
    await expect(guard()).resolves.toBeUndefined();
  });

  // Hallazgo 1: el Review Focus 4 pedía "dos pagos concurrentes, una sola
  // lectura". El test anterior solo cubría el caso secuencial.
  it("una ráfaga de pagos concurrentes comparte una sola lectura", async () => {
    const { guard, readBalance } = guardWith([MIN_RELAYER_WEI * 10n]);
    await Promise.all([guard(), guard(), guard(), guard(), guard()]);
    expect(readBalance).toHaveBeenCalledTimes(1);
  });

  // Hallazgo 2: no poder leer el saldo no es evidencia de que falte. Un timeout
  // del RPC con el relayer fondeado no debe rechazar un pago que saldría bien.
  it("deja pasar el pago si la lectura del saldo falla, y lo registra", async () => {
    const readBalance = vi.fn(async () => {
      throw new Error("HTTP request failed: 429");
    });
    const logged: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      logged.push(args);
    });
    try {
      const guard = createGasGuard({ readBalance });
      await expect(guard()).resolves.toBeUndefined();
      expect(logged).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("se recupera cuando el RPC vuelve", async () => {
    const balances = [undefined, MIN_RELAYER_WEI * 10n] as const;
    let call = 0;
    const readBalance = vi.fn(async () => {
      const next = balances[call++];
      if (next === undefined) throw new Error("HTTP request failed: 429");
      return next;
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const guard = createGasGuard({ readBalance });
      await expect(guard()).resolves.toBeUndefined();
      await expect(guard()).resolves.toBeUndefined();
      expect(readBalance).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });
});
