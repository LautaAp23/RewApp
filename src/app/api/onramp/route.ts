import { getAddress, isAddress } from "viem";
import {
  ONRAMP_MAX_USD,
  ONRAMP_PER_ADDRESS_PER_HOUR,
  ONRAMP_PER_IP_PER_HOUR,
  type OnrampResponse,
} from "@/lib/api/onramp";
import { contractAddresses, usdrAbi } from "@/lib/contracts";
import { db } from "@/lib/db";
import { getUsdRate } from "@/lib/fx";
import { isCurrency, localToUsdr, parseDecimal } from "@/lib/money";
import { publicClient } from "@/lib/server/chain";
import { getRelayer, relay } from "@/lib/server/relayer";

const HOUR_MS = 60 * 60 * 1000;

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

/** Simulated top-up: converts the local amount with FxRate and mints USDr to the account. */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const address = body?.address;
  const localAmount = body?.localAmount;
  const currency = body?.currency;
  try {
    if (typeof localAmount !== "string" || parseDecimal(localAmount, 2) <= 0n) throw new Error();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  if (typeof address !== "string" || !isAddress(address) || !isCurrency(currency)) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const usdr = contractAddresses.usdr;
  if (!usdr) return Response.json({ error: "not_configured" }, { status: 503 });

  const rate = await getUsdRate(currency);
  if (!rate) return Response.json({ error: "no_fx_rate" }, { status: 503 });
  const usdAmount = localToUsdr(localAmount, rate);
  if (usdAmount === 0n || usdAmount > ONRAMP_MAX_USD) {
    return Response.json({ error: "amount_out_of_range" }, { status: 400 });
  }

  const account = getAddress(address);
  const ip = clientIp(request);
  const since = new Date(Date.now() - HOUR_MS);
  const [byAddress, byIp] = await Promise.all([
    db.onramp.count({ where: { address: account, createdAt: { gte: since } } }),
    db.onramp.count({ where: { ip, createdAt: { gte: since } } }),
  ]);
  if (byAddress >= ONRAMP_PER_ADDRESS_PER_HOUR || byIp >= ONRAMP_PER_IP_PER_HOUR) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "3600" } });
  }

  const onramp = await db.onramp.create({
    data: { address: account, ip, localAmount, currency, usdAmount },
  });
  try {
    const { account: relayer, wallet } = getRelayer();
    const { request: mint } = await publicClient.simulateContract({
      account: relayer,
      address: usdr,
      abi: usdrAbi,
      functionName: "mint",
      args: [account, usdAmount],
    });
    const txHash = await relay((nonce) => wallet.writeContract({ ...mint, nonce }));
    await db.onramp.update({ where: { id: onramp.id }, data: { txHash } });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 30_000 });
    if (receipt.status !== "success") throw new Error(`mint reverted: ${txHash}`);
    const response: OnrampResponse = { txHash, usdAmount: usdAmount.toString() };
    return Response.json(response);
  } catch (error) {
    console.error("onramp failed", error);
    return Response.json({ error: "onramp_failed" }, { status: 502 });
  }
}
