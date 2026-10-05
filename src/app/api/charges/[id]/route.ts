import { type Address, getAddress, isAddress } from "viem";
import type { ChargeStatus, ChargeView } from "@/lib/api/charges";
import { chargeIdToBytes32, contractAddresses, rewAppPayAbi } from "@/lib/contracts";
import { db } from "@/lib/db";
import { getUsdRate } from "@/lib/fx";
import { type Currency, isCurrency, usdrToLocal } from "@/lib/money";
import { publicClient } from "@/lib/server/chain";

type Params = { params: Promise<{ id: string }> };

const USD_UNIT = 1_000_000n;

async function previewReward(merchant: Address, payer: Address, amount: bigint) {
  const rewAppPay = contractAddresses.rewAppPay;
  if (!rewAppPay) return null;
  try {
    const contract = { address: rewAppPay, abi: rewAppPayAbi } as const;
    const [visits, pointsPerUsd] = await Promise.all([
      publicClient.readContract({ ...contract, functionName: "visits", args: [payer, merchant] }),
      publicClient.readContract({ ...contract, functionName: "customerPointsPerUsd" }),
    ]);
    // payWithSig counts this visit before evaluating the rules.
    const merchantReward = await publicClient.readContract({
      ...contract,
      functionName: "previewMerchantReward",
      args: [merchant, amount, visits + 1n],
    });
    return {
      merchantReward: merchantReward.toString(),
      customerPoints: ((amount * pointsPerUsd) / USD_UNIT).toString(),
    };
  } catch {
    return null;
  }
}

/** Data for /pagar: merchant, amount in the payer's currency and the reward to earn. */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const charge = await db.charge.findUnique({ where: { id }, include: { merchant: true } });
  if (!charge) return Response.json({ error: "not_found" }, { status: 404 });

  let status: ChargeStatus = charge.status;
  if (status === "PENDING" && charge.expiresAt.getTime() <= Date.now()) {
    status = "EXPIRED";
    await db.charge.updateMany({ where: { id, status: "PENDING" }, data: { status } });
  }

  const search = new URL(request.url).searchParams;
  const payerParam = search.get("payer");
  const currencyParam = search.get("currency");
  const payer = payerParam && isAddress(payerParam) ? getAddress(payerParam) : null;
  const payerCurrency: Currency | null = isCurrency(currencyParam) ? currencyParam : null;

  const merchantAddress = getAddress(charge.merchant.address);
  const [rate, reward] = await Promise.all([
    payerCurrency ? getUsdRate(payerCurrency) : Promise.resolve(undefined),
    payer && status === "PENDING" ? previewReward(merchantAddress, payer, charge.usdAmount) : Promise.resolve(null),
  ]);

  const view: ChargeView = {
    id: charge.id,
    chargeId: chargeIdToBytes32(charge.id),
    status,
    expiresAt: charge.expiresAt.toISOString(),
    merchant: {
      name: charge.merchant.name,
      logoUrl: charge.merchant.logoUrl,
      category: charge.merchant.category,
      address: merchantAddress,
    },
    localAmount: charge.localAmount.toFixed(2),
    localCurrency: charge.localCurrency as Currency,
    usdAmount: charge.usdAmount.toString(),
    payerAmount:
      payerCurrency && rate ? { amount: usdrToLocal(charge.usdAmount, rate), currency: payerCurrency } : null,
    reward,
    txHash: charge.txHash,
  };
  return Response.json(view, { headers: { "Cache-Control": "no-store" } });
}
