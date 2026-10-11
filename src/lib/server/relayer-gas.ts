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
 *
 * Tres cosas deliberadas:
 * - El resultado **positivo** se cachea, para no sumar una ida y vuelta al RPC
 *   a cada pago. El **negativo** no: si alguien recarga el relayer, el pago
 *   siguiente pasa sin esperar a que venza la ventana.
 * - Una ráfaga de pagos concurrentes comparte la misma lectura en vuelo, en vez
 *   de hacer una por pago.
 * - Si la lectura falla, **deja pasar**. No poder leer el saldo no es evidencia
 *   de que falte, y este guard existe para dar un mensaje mejor, no para vetar
 *   pagos que saldrían bien.
 */
export function createGasGuard({
  readBalance,
  min = MIN_RELAYER_WEI,
  cacheMs = 30_000,
  now = Date.now,
}: GasGuardOptions): () => Promise<void> {
  let checkedAt = Number.NEGATIVE_INFINITY;
  let funded = true;
  let inFlight: Promise<bigint> | undefined;

  const readOnce = () => {
    inFlight ??= readBalance().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  };

  return async function assertFunded() {
    if (funded && now() - checkedAt < cacheMs) return;
    let balance: bigint;
    try {
      balance = await readOnce();
    } catch (error) {
      console.error("relayer balance check failed, letting the transaction through", error);
      return;
    }
    funded = balance >= min;
    checkedAt = now();
    if (!funded) {
      console.error(`relayer out of gas: ${balance} wei < ${min} wei`);
      throw new RelayerOutOfGasError();
    }
  };
}
