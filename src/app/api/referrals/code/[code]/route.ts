import type { ReferralCodeView } from "@/lib/api/referrals";
import { db } from "@/lib/db";
import { normalizeReferralCode } from "@/lib/referral-code";
import { readReferralProgram } from "@/lib/server/referrals";

type Params = { params: Promise<{ code: string }> };

/** Public: who invites with this code, for /i/[code] and the sign-up field. Never the address or the email. */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const code = normalizeReferralCode((await params).code);
  const profile = code
    ? await db.profile.findUnique({ where: { referralCode: code }, select: { alias: true } })
    : null;
  if (!code || !profile) return Response.json({ error: "referral_code_not_found" }, { status: 404 });
  const view: ReferralCodeView = { code, alias: profile.alias, program: await readReferralProgram() };
  return Response.json(view);
}
