import { encodeFunctionData, getAddress, isAddress, isHex, parseEventLogs, verifyTypedData } from "viem";
import type { StreakClaimResponse } from "@/lib/api/pay";
import { contractAddresses, rewAppPayAbi, rewAppPayDomain, streakClaimIntentTypes } from "@/lib/contracts";
import { publicClient } from "@/lib/server/chain";
import { durableRelay } from "@/lib/server/durable-relay";
import { assertRelayerFunded, getRelayer } from "@/lib/server/relayer";
import { revertCode } from "@/lib/server/revert";

const fail = (error: string, status = 400) => Response.json({ error }, { status });

const str = (value: unknown) => (typeof value === "string" ? value : "");

function uint(value: unknown): bigint | undefined {
  if (typeof value !== "string" || !/^\d{1,78}$/.test(value)) return undefined;
  return BigInt(value);
}

/**
 * Relays a signed StreakClaimIntent: credits the 110-point pot of a complete streak.
 * The contract is the only guard against a double claim (the cycle is marked claimed onchain),
 * so nothing is stored here.
 */
export async function POST(request: Request): Promise<Response> {
  const rewAppPay = contractAddresses.rewAppPay;
  if (!rewAppPay) return fail("not_configured", 503);

  const body = (await request.json().catch(() => null)) as { intent?: Record<string, unknown>; signature?: unknown } | null;
  const raw = body?.intent;
  const nonce = uint(raw?.nonce);
  const deadline = uint(raw?.deadline);
  const signature = body?.signature;
  if (!isAddress(str(raw?.account)) || nonce === undefined || deadline === undefined || !isHex(signature)) {
    return fail("invalid_request");
  }
  const intent = { account: getAddress(str(raw?.account)), nonce, deadline };

  const valid = await verifyTypedData({
    address: intent.account,
    domain: rewAppPayDomain(rewAppPay, publicClient.chain.id),
    types: streakClaimIntentTypes,
    primaryType: "StreakClaimIntent",
    message: intent,
    signature,
  }).catch(() => false);
  if (!valid) return fail("invalid_signature");

  try {
    await assertRelayerFunded();
  } catch {
    return fail("service_unavailable", 503);
  }

  const { account: relayer } = getRelayer();
  try {
    await publicClient.simulateContract({
      account: relayer,
      address: rewAppPay,
      abi: rewAppPayAbi,
      functionName: "claimStreakWithSig",
      args: [intent, signature],
    });
  } catch (error) {
    const code = revertCode(error);
    if (code) return fail(code, code === "streak_not_claimable" ? 409 : 400);
    console.error("streak claim simulation failed", error);
    return fail("relay_failed", 502);
  }

  try {
    const txHash = await durableRelay(
      rewAppPay,
      encodeFunctionData({ abi: rewAppPayAbi, functionName: "claimStreakWithSig", args: [intent, signature] }),
      async () => {},
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 30_000 });
    if (receipt.status !== "success") return fail("relay_failed", 502);
    const [claimed] = parseEventLogs({ abi: rewAppPayAbi, eventName: "StreakClaimed", logs: receipt.logs });
    const response: StreakClaimResponse = { txHash, points: (claimed?.args.points ?? 0n).toString() };
    return Response.json(response);
  } catch (error) {
    console.error("streak claim relay failed", error);
    return fail("service_unavailable", 503);
  }
}
