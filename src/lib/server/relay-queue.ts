import { BaseError } from "viem";

/**
 * Cuántas veces se intenta una transacción del relayer antes de rendirse.
 * Cada instancia de la función lleva su propio nonce, así que con varias
 * compitiendo el primer choque es normal: un solo reintento no alcanzaba.
 */
export const RELAY_ATTEMPTS = 4;

/**
 * Los textos con los que un nodo avisa un choque de nonce. Dos de ellos no
 * dicen "nonce": `replacement transaction underpriced` y `already known` son lo
 * que devuelve un nodo de la familia Geth cuando dos instancias eligen el mismo
 * nonce, que es exactamente el choque que estos reintentos vienen a cubrir.
 * viem mapea `already known` a NonceTooLowError, pero no dependemos de eso.
 */
const NONCE_COLLISION = /nonce|replacement transaction underpriced|already known/i;

/** El texto de un error de viem incluye su shortMessage y sus details. */
export function relayErrorText(error: unknown) {
  return error instanceof BaseError ? `${error.shortMessage} ${error.details}` : String(error);
}

export function isNonceError(error: unknown) {
  return NONCE_COLLISION.test(relayErrorText(error));
}

/**
 * El nonce del relayer memorizado dentro de esta instancia. `getNonce` lo
 * entrega y lo invalida en el acto, así un envío fallido obliga al intento
 * siguiente a pedirlo de nuevo a la cadena; `commit` lo avanza después de un
 * envío aceptado. Si los intentos se agotan, el memo queda sucio a propósito.
 */
export function createNonceMemo({ readChainNonce }: { readChainNonce: () => Promise<number> }) {
  let memo: number | undefined;
  return {
    async getNonce() {
      memo ??= await readChainNonce();
      const nonce = memo;
      memo = undefined;
      return nonce;
    },
    commit(usedNonce: number) {
      memo = usedNonce + 1;
    },
  };
}

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
      const retriable = isNonceError(error);
      // El texto crudo del primer fallo, una vez por relay: es el único modo de
      // saber qué mensajes manda Monad en lugar de adivinar los de Geth.
      if (attempt === 0) {
        console.error(`relay attempt failed (retriable=${retriable}):`, relayErrorText(error));
      }
      if (attempt + 1 >= attempts || !retriable) throw error;
      await sleep(25 * (attempt + 1));
    }
  }
}
