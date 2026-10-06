import { getAddress, isAddress, isHex, verifyTypedData } from "viem";
import type { RedeemResponse } from "@/lib/api/pay";
import { contractAddresses, redeemIntentTypes, rewAppPayAbi, rewAppPayDomain } from "@/lib/contracts";
import { publicClient } from "@/lib/server/chain";
import { getRelayer, relay } from "@/lib/server/relayer";
import { revertCode } from "@/lib/server/revert";

const fail = (error: string, status = 400) => Response.json({ error }, { status });

type Fields = Record<string, unknown>;
type Body = { charge?: unknown; intent?: Fields; signature?: unknown; permit?: Fields };

const str = (value: unknown) => (typeof value === "string" ? value : "");

function uint(value: unknown): bigint | undefined {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined;
  return BigInt(value);
}

/** Relays a signed RedeemIntent: spends RewPoints on a reward without MON. */
export async function POST(request: Request): Promise<Response> {
  const rewAppPay = contractAddresses.rewAppPay;
  if (!rewAppPay) return fail("not_configured", 503);

  const body = (await request.json().catch(() => null)) as Body | null;
  const raw = body?.intent;
  const rewardId = uint(raw?.rewardId);
  const nonce = uint(raw?.nonce);
  const deadline = uint(raw?.deadline);
  const signature = body?.signature;
  if (
    !isAddress(str(raw?.account)) ||
    rewardId === undefined ||
    nonce === undefined ||
    deadline === undefined ||
    !isHex(signature)
  ) {
    return fail("invalid_request");
  }
  const intent = { account: getAddress(str(raw?.account)), rewardId, nonce, deadline };

  const valid = await verifyTypedData({
    address: intent.account,
    domain: rewAppPayDomain(rewAppPay, publicClient.chain.id),
    types: redeemIntentTypes,
    primaryType: "RedeemIntent",
    message: intent,
    signature,
  }).catch(() => false);
  if (!valid) return fail("invalid_signature");

  const { account: relayer, wallet } = getRelayer();
  let simulated;
  try {
    simulated = await publicClient.simulateContract({
      account: relayer,
      address: rewAppPay,
      abi: rewAppPayAbi,
      functionName: "redeemWithSig",
      args: [intent, signature],
    });
  } catch (error) {
    const code = revertCode(error);
    if (code) return fail(code);
    console.error("redeem simulation failed", error);
    return fail("relay_failed", 502);
  }

  try {
    const txHash = await relay((n) => wallet.writeContract({ ...simulated.request, nonce: n }));
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 30_000 });
    if (receipt.status !== "success") throw new Error(`redeemWithSig reverted: ${txHash}`);
    const response: RedeemResponse = { txHash };
    return Response.json(response);
  } catch (error) {
    console.error("redeem relay failed", error);
    return fail("relay_failed", 502);
  }
}
