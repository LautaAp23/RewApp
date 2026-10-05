import { getAddress, isAddress, isHex, verifyTypedData } from "viem";
import { CHARGE_TTL_MS } from "@/lib/api/charges";
import { createChargeTypes, isFreshDeadline, rewAppApiDomain } from "@/lib/api/typed-data";
import { chargeIdToBytes32 } from "@/lib/contracts";
import { db } from "@/lib/db";
import { getUsdRate } from "@/lib/fx";
import { isCurrency, localToUsdr, parseDecimal } from "@/lib/money";

function chainId() {
  return Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143);
}

/** The merchant creates a charge in its own currency; it is stored converted to USDr. */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const merchantAddress = body?.merchant;
  const localAmount = body?.localAmount;
  const currency = body?.currency;
  const signature = body?.signature;
  let deadline: bigint;
  try {
    deadline = BigInt(String(body?.deadline));
    if (typeof localAmount !== "string" || parseDecimal(localAmount, 2) <= 0n) throw new Error();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  if (typeof merchantAddress !== "string" || !isAddress(merchantAddress) || !isCurrency(currency) || !isHex(signature)) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!isFreshDeadline(deadline)) {
    return Response.json({ error: "expired_signature" }, { status: 400 });
  }
  const address = getAddress(merchantAddress);

  const valid = await verifyTypedData({
    address,
    domain: rewAppApiDomain(chainId()),
    types: createChargeTypes,
    primaryType: "CreateCharge",
    message: { merchant: address, localAmount, currency, deadline },
    signature,
  }).catch(() => false);
  if (!valid) return Response.json({ error: "invalid_signature" }, { status: 401 });

  const merchant = await db.merchant.findUnique({ where: { address } });
  if (!merchant) return Response.json({ error: "not_merchant" }, { status: 403 });
  if (merchant.currency !== currency) {
    return Response.json({ error: "wrong_currency" }, { status: 400 });
  }

  const rate = await getUsdRate(currency);
  if (!rate) return Response.json({ error: "no_fx_rate" }, { status: 503 });
  const usdAmount = localToUsdr(localAmount, rate);
  if (usdAmount === 0n) return Response.json({ error: "invalid_request" }, { status: 400 });

  const charge = await db.charge.create({
    data: {
      merchantId: merchant.id,
      localAmount,
      localCurrency: currency,
      usdAmount,
      expiresAt: new Date(Date.now() + CHARGE_TTL_MS),
    },
  });
  const origin = new URL(request.url).origin;
  return Response.json(
    {
      id: charge.id,
      chargeId: chargeIdToBytes32(charge.id),
      url: `${origin}/pagar/${charge.id}`,
      localAmount: charge.localAmount.toFixed(2),
      localCurrency: charge.localCurrency,
      usdAmount: charge.usdAmount.toString(),
      expiresAt: charge.expiresAt.toISOString(),
    },
    { status: 201 },
  );
}
