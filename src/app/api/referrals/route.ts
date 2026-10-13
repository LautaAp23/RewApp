import { encodeFunctionData, getAddress, isAddress, isHex } from "viem";
import { verifySignedRequest } from "@/lib/api/signed-request";
import { REFERRALS_PER_IP_PER_HOUR } from "@/lib/api/referrals";
import { claimReferralTypes } from "@/lib/api/typed-data";
import { contractAddresses, rewAppPayAbi } from "@/lib/contracts";
import { db } from "@/lib/db";
import { normalizeReferralCode } from "@/lib/referral-code";
import { publicClient } from "@/lib/server/chain";
import { clientIp } from "@/lib/server/client-ip";
import { durableRelay } from "@/lib/server/durable-relay";
import { assertRelayerFunded, getRelayer } from "@/lib/server/relayer";
import { revertCode } from "@/lib/server/revert";

const fail = (error: string, status: number) => Response.json({ error }, { status });
const HOUR_MS = 60 * 60 * 1000;
const CONTRACT_CODES = new Set(["already_referred", "referral_closed", "referrals_paused"]);

/**
 * Body: { account, code, deadline, signature } signed as ClaimReferral. Records onchain who invited the
 * account (docs/MODEL.md §6.5). Answers 202 once broadcast; GET /api/referrals/[address] reconciles.
 */
export async function POST(request: Request): Promise<Response> {
  const rewAppPay = contractAddresses.rewAppPay;
  if (!rewAppPay) return fail("not_configured", 503);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const raw = body?.account;
  const rawCode = body?.code;
  const signature = body?.signature;
  if (typeof raw !== "string" || !isAddress(raw) || typeof rawCode !== "string" || !isHex(signature)) {
    return fail("invalid_request", 400);
  }
  let deadline: bigint;
  try {
    deadline = BigInt(String(body?.deadline));
  } catch {
    return fail("invalid_request", 400);
  }
  const account = getAddress(raw);
  const checked = await verifySignedRequest({
    signer: account,
    types: claimReferralTypes,
    primaryType: "ClaimReferral",
    message: { account, code: rawCode, deadline },
    deadline,
    signature,
    fresh: true,
  });
  if (checked === "expired_signature") return fail("expired_signature", 400);
  if (checked !== "ok") return fail("invalid_signature", 401);

  const code = normalizeReferralCode(rawCode);
  const owner = code ? await db.profile.findUnique({ where: { referralCode: code }, select: { address: true } }) : null;
  if (!code || !owner) return fail("referral_code_not_found", 404);
  const referrer = getAddress(owner.address);
  if (referrer === account) return fail("own_code", 409);
  const existing = await db.referral.findUnique({ where: { referee: account } });
  if (existing && existing.status !== "FAILED") return fail("already_referred", 409);
  const paid = await db.charge.findFirst({ where: { payer: account, status: "PAID" }, select: { id: true } });
  if (paid) return fail("referral_closed", 409);

  const ip = clientIp(request);
  const recent = await db.referral.count({ where: { ip, createdAt: { gte: new Date(Date.now() - HOUR_MS) } } });
  if (recent >= REFERRALS_PER_IP_PER_HOUR) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "3600" } });
  }
  try {
    await assertRelayerFunded();
  } catch {
    return fail("service_unavailable", 503);
  }
  try {
    await publicClient.simulateContract({
      account: getRelayer().account,
      address: rewAppPay,
      abi: rewAppPayAbi,
      functionName: "setReferral",
      args: [account, referrer],
    });
  } catch (error) {
    const reverted = revertCode(error);
    if (reverted && CONTRACT_CODES.has(reverted)) return fail(reverted, 409);
    console.error("referral simulation failed", error);
    return fail("service_unavailable", 503);
  }

  await db.referral.upsert({
    where: { referee: account },
    create: { referee: account, referrer, code, ip },
    update: { referrer, code, ip, status: "ARMING", armTxHash: null, expiresAt: null, createdAt: new Date() },
  });
  const data = encodeFunctionData({ abi: rewAppPayAbi, functionName: "setReferral", args: [account, referrer] });
  try {
    await durableRelay(rewAppPay, data, (hash) =>
      db.referral.update({ where: { referee: account }, data: { armTxHash: hash } }),
    );
  } catch (error) {
    console.error("referral relay failed", error);
    const stored = await db.referral.findUnique({ where: { referee: account }, select: { armTxHash: true } });
    if (!stored?.armTxHash) {
      await db.referral.update({ where: { referee: account }, data: { status: "FAILED" } });
      return fail("relay_failed", 502);
    }
  }
  return Response.json({ status: "arming" }, { status: 202 });
}
