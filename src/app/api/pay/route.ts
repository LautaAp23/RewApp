import { durableRelay } from "@/lib/server/durable-relay";
import { refreshCharge } from "@/lib/server/charge-state";
import {
  encodeFunctionData,
  getAddress,
  isAddress,
  isHex,
  parseEventLogs,
  verifyTypedData,
} from "viem";
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
import { assertRelayerFunded, getRelayer } from "@/lib/server/relayer";
import { RelayerOutOfGasError } from "@/lib/server/relayer-gas";
import { recordReferralReward } from "@/lib/server/referrals";
import { revertCode } from "@/lib/server/revert";

const fail = (error: string, status = 400) =>
  Response.json({ error }, { status });

type Fields = Record<string, unknown>;
type Body = {
  charge?: unknown;
  intent?: Fields;
  signature?: unknown;
  permit?: Fields;
};

const str = (value: unknown) => (typeof value === "string" ? value : "");

function uint(value: unknown): bigint | undefined {
  if (typeof value !== "string" || !/^\d{1,78}$/.test(value)) return undefined;
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

  const charge = await refreshCharge(chargeKey);
  if (!charge) return fail("not_found", 404);
  if (charge.status === "PAID") return fail("already_paid", 409);
  if (charge.status === "SPLIT") return fail("charge_split", 409);
  if (charge.status === "PROCESSING") return fail("already_processing", 409);
  if (charge.expectedPayer && intent.payer !== getAddress(charge.expectedPayer))
    return fail("wrong_participant", 403);
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

  // Sin combustible el relayer no puede liquidar: cortar acá deja un mensaje
  // humano en vez de dejar fallar la transacción y devolver un 502 opaco.
  try {
    await assertRelayerFunded();
  } catch (error) {
    if (error instanceof RelayerOutOfGasError)
      return fail("service_unavailable", 503);
    return fail("service_unavailable", 503);
  }

  const { account: relayer } = getRelayer();
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

  const reserved = await db.charge.updateMany({
    where: { id: charge.id, status: "PENDING", expiresAt: { gt: new Date() } },
    data: { status: "PROCESSING", payer: intent.payer },
  });
  if (!reserved.count) return fail("charge_unavailable", 409);
  try {
    const txHash = await durableRelay(
      rewAppPay,
      encodeFunctionData({
        abi: rewAppPayAbi,
        functionName: "payWithSig",
        args: [intent, signature, permit],
      }),
      (hash) =>
        db.charge.update({ where: { id: charge.id }, data: { txHash: hash } }),
    );
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 30_000,
    });
    if (receipt.status !== "success") {
      await db.charge.update({
        where: { id: charge.id },
        data: { status: "PENDING", txHash: null },
      });
      return fail("relay_failed", 502);
    }
    const [settled] = parseEventLogs({
      abi: rewAppPayAbi,
      eventName: "PaymentSettled",
      logs: receipt.logs,
    });
    await db.charge.update({
      where: { id: charge.id },
      data: { status: "PAID", txHash, payer: intent.payer },
    });
    // Never fails the payment: the copy also reconciles from GET /api/referrals/[address].
    const referral = await recordReferralReward(receipt.logs, txHash).catch((error) => {
      console.error("referral record failed", error);
      return null;
    });
    if (charge.parentId) await refreshCharge(charge.parentId);
    const response: PayResponse = {
      txHash,
      merchantReward: (
        settled?.args.merchantReward ?? simulated.result
      ).toString(),
      customerPoints: (settled?.args.customerPointsEarned ?? 0n).toString(),
      referralBonus: referral?.refereeBonus ?? "0",
      referrerAlias: referral?.referrerAlias ?? null,
    };
    return Response.json(response);
  } catch (error) {
    console.error("pay relay failed", error);
    const stored = await db.charge.findUnique({ where: { id: charge.id } });
    if (!stored?.txHash) {
      await db.charge.update({
        where: { id: charge.id },
        data: { status: "PENDING" },
      });
      return fail("service_unavailable", 503);
    }
    return fail("already_processing", 409);
  }
}
