import QRCode from "qrcode";
import { getAddress, isAddress, isHex } from "viem";
import { CHARGE_TTL_MS } from "@/lib/api/charges";
import { verifySignedRequest } from "@/lib/api/signed-request";
import { createChargeTypes } from "@/lib/api/typed-data";
import { chargeIdToBytes32 } from "@/lib/contracts";
import { db } from "@/lib/db";
import { getUsdRate } from "@/lib/fx";
import { isCurrency, localToUsdr, parseDecimal } from "@/lib/money";
import { workspaceAccount } from "@/lib/server/workspace-auth";

function chainId() {
  return Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143);
}

/**
 * The merchant creates a charge in its own currency; it is stored converted to USDr.
 * An open register uses the signed-in session. A signature is the other way in, for tools.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const merchantAddress = body?.merchant;
  const localAmount = body?.localAmount;
  const currency = body?.currency;
  const signature = body?.signature;
  const registerId = typeof body?.registerId === "string" ? body.registerId : "";
  try {
    if (typeof localAmount !== "string" || parseDecimal(localAmount, 2) <= 0n) throw new Error();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  if (typeof merchantAddress !== "string" || !isAddress(merchantAddress) || !isCurrency(currency)) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const address = getAddress(merchantAddress);

  const merchant = isHex(signature)
    ? await merchantFromSignature(body, address, localAmount, currency, signature)
    : await merchantFromSession(request, address, registerId);
  if (merchant instanceof Response) return merchant;
  if (merchant.currency !== currency) {
    return Response.json({ error: "wrong_currency" }, { status: 400 });
  }

  const rate = await getUsdRate(currency);
  if (!rate) return Response.json({ error: "no_fx_rate" }, { status: 503 });
  const usdAmount = localToUsdr(localAmount, rate);
  if (usdAmount === 0n) return Response.json({ error: "invalid_request" }, { status: 400 });

  if (registerId) {
    const register = await db.register.findFirst({ where: { id: registerId, merchantId: merchant.id } });
    if (!register) return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const charge = await db.charge.create({
    data: {
      merchantId: merchant.id,
      localAmount,
      localCurrency: currency,
      usdAmount,
      expiresAt: new Date(Date.now() + CHARGE_TTL_MS),
      registerId: registerId || null,
    },
  });
  const origin = new URL(request.url).origin;
  const url = `${origin}/pagar/${charge.id}`;
  const qrDataUrl = await QRCode.toDataURL(url, { width: 320, margin: 4, errorCorrectionLevel: "M" });
  return Response.json(
    {
      id: charge.id,
      chargeId: chargeIdToBytes32(charge.id),
      url,
      qrDataUrl,
      localAmount: charge.localAmount.toFixed(2),
      localCurrency: charge.localCurrency,
      usdAmount: charge.usdAmount.toString(),
      expiresAt: charge.expiresAt.toISOString(),
    },
    { status: 201 },
  );
}

/** Tools sign CreateCharge. The open register does not. */
async function merchantFromSignature(
  body: Record<string, unknown> | null,
  address: `0x${string}`,
  localAmount: string,
  currency: string,
  signature: `0x${string}`,
) {
  let deadline: bigint;
  try {
    deadline = BigInt(String(body?.deadline));
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const checked = await verifySignedRequest({
    signer: address,
    types: createChargeTypes,
    primaryType: "CreateCharge",
    message: { merchant: address, localAmount, currency, deadline },
    deadline,
    signature,
    fresh: true,
    chainId: chainId(),
  });
  if (checked === "expired_signature") return Response.json({ error: "expired_signature" }, { status: 400 });
  if (checked !== "ok") return Response.json({ error: "invalid_signature" }, { status: 401 });
  const merchant = await db.merchant.findUnique({ where: { address } });
  if (!merchant) return Response.json({ error: "not_merchant" }, { status: 403 });
  return merchant;
}

/** The person already signed in, and the charge names one of their registers. */
async function merchantFromSession(request: Request, address: `0x${string}`, registerId: string) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const account = await workspaceAccount();
  if (!account) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!registerId) return Response.json({ error: "invalid_request" }, { status: 400 });
  const merchant = await db.merchant.findFirst({
    where: { address, OR: [{ ownerAddress: account }, { address: account }] },
  });
  if (!merchant) return Response.json({ error: "not_merchant" }, { status: 403 });
  return merchant;
}
