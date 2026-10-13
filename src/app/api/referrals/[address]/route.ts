import { getAddress, isAddress } from "viem";
import { inviteStatus, type InvitedFriend, type ReferralsView } from "@/lib/api/referrals";
import { db } from "@/lib/db";
import { readReferralProgram, reconcileReferral } from "@/lib/server/referrals";

type Params = { params: Promise<{ address: string }> };
const LIST_LIMIT = 50;

/** Invite screen, home card and notices. Public like /api/activity: aliases are public, the link is onchain. */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { address } = await params;
  if (!isAddress(address)) return Response.json({ error: "invalid_address" }, { status: 400 });
  const account = getAddress(address);
  const now = new Date();
  const [profile, sent, received, program] = await Promise.all([
    db.profile.findUnique({ where: { address: account }, select: { referralCode: true } }),
    db.referral.findMany({
      where: { referrer: account, status: { not: "FAILED" } },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
    }),
    db.referral.findUnique({ where: { referee: account } }),
    readReferralProgram(),
  ]);
  const rows = await Promise.all(sent.map((row) => reconcileReferral(row, now)));
  const mine = received ? await reconcileReferral(received, now) : null;
  const names = await db.profile.findMany({
    where: { address: { in: [...rows.map((row) => row.referee), ...(mine ? [mine.referrer] : [])] } },
    select: { address: true, alias: true },
  });
  const alias = (who: string) => names.find((p) => p.address === who)?.alias ?? null;

  const invited: InvitedFriend[] = rows.flatMap((row) => {
    const status = inviteStatus(row, now);
    return status
      ? [{ id: row.referee, alias: alias(row.referee), status, referrerBonus: row.referrerBonus, at: row.createdAt.toISOString() }]
      : [];
  });
  const earned = rows.reduce(
    (sum, row) => sum + (row.status === "REWARDED" && row.referrerBonus ? BigInt(row.referrerBonus) : 0n),
    0n,
  );
  const myStatus = mine ? inviteStatus(mine, now) : null;
  const view: ReferralsView = {
    code: profile?.referralCode ?? null,
    program,
    invited,
    earned: earned.toString(),
    myInvite: mine && myStatus ? { alias: alias(mine.referrer), status: myStatus } : null,
  };
  return Response.json(view, { headers: { "Cache-Control": "no-store" } });
}
