import "server-only";
import { BaseError, createWalletClient, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { publicClient } from "./chain";
import { sendWithNonceRetries } from "./relay-queue";
import { createGasGuard } from "./relayer-gas";

function createRelayer() {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key) throw new Error("RELAYER_PRIVATE_KEY is not set");
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  const wallet = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL ?? monadTestnet.rpcUrls.default.http[0]),
  });
  return { account, wallet };
}

let relayer: ReturnType<typeof createRelayer> | undefined;

/** The server-side relayer (ONRAMP_ROLE on USDr, pays gas for payWithSig). */
function getRelayer() {
  relayer ??= createRelayer();
  return relayer;
}

/**
 * Corta antes de simular cuando el relayer no tiene con qué pagar el gas, para
 * que la ruta pueda devolver un mensaje humano en vez de un 502 opaco.
 */
const assertRelayerFunded = createGasGuard({
  readBalance: () => publicClient.getBalance({ address: getRelayer().account.address }),
});

function isNonceError(error: unknown) {
  const text = error instanceof BaseError ? `${error.shortMessage} ${error.details}` : String(error);
  return /nonce/i.test(text);
}

let queue: Promise<unknown> = Promise.resolve();
let nextNonce: number | undefined;

/**
 * Serializes relayer transactions in this instance and assigns nonces locally,
 * so concurrent requests never reuse one. On a nonce error (another instance
 * sent a transaction) it resyncs from the chain and retries, up to
 * RELAY_ATTEMPTS times: with several instances competing, one collision is
 * normal and a single retry was not enough.
 */
function relay<T>(send: (nonce: number) => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const { account } = getRelayer();
    // El memo evita releer el nonce en cada relay. Se limpia al entregarlo: si
    // el envío falla, el reintento lo vuelve a pedir a la cadena.
    const getNonce = async () => {
      nextNonce ??= await publicClient.getTransactionCount({
        address: account.address,
        blockTag: "pending",
      });
      const nonce = nextNonce;
      nextNonce = undefined;
      return nonce;
    };
    const { result, usedNonce } = await sendWithNonceRetries({ getNonce, send, isNonceError });
    nextNonce = usedNonce + 1;
    return result;
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

export { assertRelayerFunded, getRelayer, relay };
