import "server-only";
import { createWalletClient, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { publicClient } from "./chain";
import { createNonceMemo, isNonceError, sendWithNonceRetries } from "./relay-queue";
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

let queue: Promise<unknown> = Promise.resolve();

const nonces = createNonceMemo({
  readChainNonce: () =>
    publicClient.getTransactionCount({
      address: getRelayer().account.address,
      blockTag: "pending",
    }),
});

/**
 * Serializes relayer transactions in this instance so concurrent requests never
 * reuse a nonce. The memo lives in relay-queue.ts (createNonceMemo) and the
 * retries in sendWithNonceRetries; this is only the wiring.
 */
function relay<T>(send: (nonce: number) => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const { result, usedNonce } = await sendWithNonceRetries({
      getNonce: nonces.getNonce,
      send,
      isNonceError,
    });
    nonces.commit(usedNonce);
    return result;
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

export { assertRelayerFunded, getRelayer, relay };
