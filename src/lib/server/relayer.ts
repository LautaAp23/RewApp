import "server-only";
import { BaseError, createWalletClient, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { publicClient } from "./chain";

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

function isNonceError(error: unknown) {
  const text = error instanceof BaseError ? `${error.shortMessage} ${error.details}` : String(error);
  return /nonce/i.test(text);
}

let queue: Promise<unknown> = Promise.resolve();
let nextNonce: number | undefined;

/**
 * Serializes relayer transactions in this instance and assigns nonces locally,
 * so concurrent requests never reuse one. On a nonce error (another instance
 * sent a transaction) it resyncs from the chain and retries once.
 */
function relay<T>(send: (nonce: number) => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const { account } = getRelayer();
    for (let attempt = 0; ; attempt++) {
      nextNonce ??= await publicClient.getTransactionCount({
        address: account.address,
        blockTag: "pending",
      });
      try {
        const result = await send(nextNonce);
        nextNonce += 1;
        return result;
      } catch (error) {
        nextNonce = undefined;
        if (attempt > 0 || !isNonceError(error)) throw error;
      }
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

export { getRelayer, relay };
