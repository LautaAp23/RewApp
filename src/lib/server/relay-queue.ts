/**
 * Cuántas veces se intenta una transacción del relayer antes de rendirse.
 * Cada instancia de la función lleva su propio nonce, así que con varias
 * compitiendo el primer choque es normal: un solo reintento no alcanzaba.
 */
export const RELAY_ATTEMPTS = 4;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type SendOptions<T> = {
  getNonce: () => Promise<number>;
  send: (nonce: number) => Promise<T>;
  isNonceError: (error: unknown) => boolean;
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Manda con el nonce que da `getNonce` y, si el error es de nonce, lo relee y
 * reintenta con un backoff corto. Devuelve el nonce que terminó usando para
 * que quien llama pueda avanzar su memo.
 */
export async function sendWithNonceRetries<T>({
  getNonce,
  send,
  isNonceError,
  attempts = RELAY_ATTEMPTS,
  sleep = wait,
}: SendOptions<T>): Promise<{ result: T; usedNonce: number }> {
  for (let attempt = 0; ; attempt++) {
    const nonce = await getNonce();
    try {
      return { result: await send(nonce), usedNonce: nonce };
    } catch (error) {
      if (attempt + 1 >= attempts || !isNonceError(error)) throw error;
      await sleep(25 * (attempt + 1));
    }
  }
}
