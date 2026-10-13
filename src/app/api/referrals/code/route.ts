import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getAddress, isAddress, isHex } from "viem";
import { verifySignedRequest } from "@/lib/api/signed-request";
import { referralCodeTypes } from "@/lib/api/typed-data";
import { db } from "@/lib/db";
import { makeReferralCode } from "@/lib/referral-code";

const fail = (error: string, status: number) => Response.json({ error }, { status });
const MAX_ATTEMPTS = 5;

/** Body: { account, deadline, signature } signed as ReferralCode. Returns the caller's code, creating it once. */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const raw = body?.account;
  const signature = body?.signature;
  if (typeof raw !== "string" || !isAddress(raw) || !isHex(signature)) return fail("invalid_request", 400);
  let deadline: bigint;
  try {
    deadline = BigInt(String(body?.deadline));
  } catch {
    return fail("invalid_request", 400);
  }
  const account = getAddress(raw);
  const checked = await verifySignedRequest({
    signer: account,
    types: referralCodeTypes,
    primaryType: "ReferralCode",
    message: { account, deadline },
    deadline,
    signature,
    fresh: true,
  });
  if (checked === "expired_signature") return fail("expired_signature", 400);
  if (checked !== "ok") return fail("invalid_signature", 401);

  const profile = await db.profile.findUnique({ where: { address: account }, select: { alias: true, referralCode: true } });
  if (!profile) return fail("profile_required", 409);
  if (profile.referralCode) return Response.json({ code: profile.referralCode });

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = makeReferralCode(profile.alias, randomInt);
    try {
      // Only where none exists: a shared code must never be replaced.
      const { count } = await db.profile.updateMany({
        where: { address: account, referralCode: null },
        data: { referralCode: code },
      });
      if (count === 1) return Response.json({ code });
      const current = await db.profile.findUnique({ where: { address: account }, select: { referralCode: true } });
      if (current?.referralCode) return Response.json({ code: current.referralCode });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  return fail("service_unavailable", 503);
}
