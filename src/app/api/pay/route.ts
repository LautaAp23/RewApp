import { getAddress, isAddress, isHex, parseEventLogs, verifyTypedData } from "viem";
import type { PayResponse } from "@/lib/api/pay";
import {
  chargeIdToBytes32,
  contractAddresses,
  paymentIntentTypes,
  rewAppPayAbi,
  rewAppPayDomain,
} from "@/lib/contracts";
import { db } from "@/lib/db";
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

/** Relays a signed PaymentIntent (+ USDr permit) so the payer never needs MON. */
export async function POST(request: Request): Promise<Response> {
  const rewAppPay = contractAddresses.rewAppPay;
  if (!rewAppPay) return fail("not_configured", 503);

  const body = (await request.json().catch(() => null)) as Body | null;
  const raw = body?.intent;
  const rawPermit = body?.permit;
  const amount = uint(raw?.amount);
  const nonce = uint(raw?.nonce);
  const deadline = uint(raw?.deadline);
  const permitValue = uint(rawPermit?.value);
  const permitDeadline = uint(rawPermit?.deadline);
  const chargeKey = body?.charge;
  const chargeId = raw?.chargeId;
  const signature = body?.signature;
  const [v, r, sig] = [rawPermit?.v, rawPermit?.r, rawPermit?.s];
  if (
    typeof chargeKey !== "string" ||
    !isAddress(str(raw?.payer)) ||
    !isAddress(str(raw?.merchant)) ||
    !isHex(chargeId) ||
    amount === undefined ||
    nonce === undefined ||
    deadline === undefined ||
    !isHex(signature) ||
    permitValue === undefined ||
    permitDeadline === undefined ||
    typeof v !== "number" ||
    !isHex(r) ||
    !isHex(sig)
  ) {
    return fail("invalid_request");
  }
  const intent = {
    payer: getAddress(str(raw?.payer)),
    merchant: getAddress(str(raw?.merchant)),
    amount,
    chargeId,
    nonce,
    deadline,
  };
  const permit = {
    value: permitValue,
    deadline: permitDeadline,
    v,
    r,
    s: sig,
  };

  const charge = await db.charge.findUnique({
    where: { id: chargeKey },
    include: { merchant: true },
  });
  if (!charge) return fail("not_found", 404);
  if (charge.status === "PAID") return fail("already_paid", 409);
  if (charge.status === "EXPIRED" || charge.expiresAt.getTime() <= Date.now()) {
    return fail("expired", 410);
  }
  if (
    intent.chargeId !== chargeIdToBytes32(charge.id) ||
    intent.merchant !== getAddress(charge.merchant.address) ||
    intent.amount !== charge.usdAmount
  ) {
    return fail("charge_mismatch");
  }

  const valid = await verifyTypedData({
    address: intent.payer,
    domain: rewAppPayDomain(rewAppPay, publicClient.chain.id),
    types: paymentIntentTypes,
    primaryType: "PaymentIntent",
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
      functionName: "payWithSig",
      args: [intent, signature, permit],
    });
  } catch (error) {
    const code = revertCode(error);
    if (code) return fail(code, code === "already_paid" ? 409 : 400);
    console.error("pay simulation failed", error);
    return fail("relay_failed", 502);
  }

  try {
    const txHash = await relay((n) => wallet.writeContract({ ...simulated.request, nonce: n }));
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 30_000 });
    if (receipt.status !== "success") throw new Error(`payWithSig reverted: ${txHash}`);
    const [settled] = parseEventLogs({
      abi: rewAppPayAbi,
      eventName: "PaymentSettled",
      logs: receipt.logs,
    });
    await db.charge.update({
      where: { id: charge.id },
      data: { status: "PAID", txHash, payer: intent.payer },
    });
    const response: PayResponse = {
      txHash,
      merchantReward: (settled?.args.merchantReward ?? simulated.result).toString(),
      customerPoints: (settled?.args.customerPointsEarned ?? 0n).toString(),
    };
    return Response.json(response);
  } catch (error) {
    console.error("pay relay failed", error);
    return fail("relay_failed", 502);
  }
}
