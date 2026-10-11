import "server-only";
import { keccak256, type Address, type Hash, type Hex } from "viem";
import { getRelayer, relay } from "@/lib/server/relayer";
/** Persist the deterministic hash BEFORE broadcasting: network timeouts remain recoverable. */
export async function durableRelay(
  to: Address,
  data: Hex,
  beforeBroadcast: (hash: Hash) => Promise<unknown>,
) {
  const { account, wallet } = getRelayer();
  return relay(async (nonce) => {
    const request = await wallet.prepareTransactionRequest({
      account,
      to,
      data,
      nonce,
    });
    const serializedTransaction = await wallet.signTransaction(request);
    const hash = keccak256(serializedTransaction);
    await beforeBroadcast(hash);
    return wallet.sendRawTransaction({ serializedTransaction });
  });
}
