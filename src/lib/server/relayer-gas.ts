/**
 * Umbral de combustible del relayer. Debajo de esto no se puede garantizar la
 * próxima transacción, así que las rutas cortan con un error propio en vez de
 * dejar que la transacción falle y devolver un 502 que no explica nada.
 * Medido el 11 oct 2026: ~0.024 MON por transacción, así que 0.1 MON son unas
 * cuatro operaciones de colchón.
 */
export const MIN_RELAYER_WEI = 100_000_000_000_000_000n;

export class RelayerOutOfGasError extends Error {
  constructor() {
    super("relayer below minimum balance");
    this.name = "RelayerOutOfGasError";
  }
}

type GasGuardOptions = {
  readBalance: () => Promise<bigint>;
  min?: bigint;
  cacheMs?: number;
  now?: () => number;
};

/**
 * Devuelve una función que corta cuando el relayer no tiene con qué pagar.
 * El resultado se cachea para no sumar una ida y vuelta al RPC a cada pago.
 */
export function createGasGuard({
  readBalance,
  min = MIN_RELAYER_WEI,
  cacheMs = 30_000,
  now = Date.now,
}: GasGuardOptions): () => Promise<void> {
  let checkedAt = Number.NEGATIVE_INFINITY;
  let funded = true;
  return async function assertFunded() {
    const at = now();
    if (at - checkedAt >= cacheMs) {
      const balance = await readBalance();
      funded = balance >= min;
      checkedAt = at;
      if (!funded) {
        console.error(`relayer out of gas: ${balance} wei < ${min} wei`);
      }
    }
    if (!funded) throw new RelayerOutOfGasError();
  };
}
