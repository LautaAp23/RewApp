/** JSON shapes of /api/referrals. Points and USDr amounts travel as decimal strings. */
export type ReferralProgram = {
  referrerBonus: string;
  refereeBonus: string;
  /** USDr base units (6 decimals). */
  minAmount: string;
  windowDays: number;
  /** False while the contract has the program paused (window 0). */
  active: boolean;
};

export type InviteStatus = "pending" | "rewarded" | "expired";

export type InvitedFriend = {
  /** The invited account; stable id for lists and notices. */
  id: string;
  alias: string | null;
  status: InviteStatus;
  referrerBonus: string | null;
  at: string;
};

export type ReferralsView = {
  code: string | null;
  program: ReferralProgram | null;
  invited: InvitedFriend[];
  /** Points this account earned inviting. */
  earned: string;
  /** Who invited this account, while it matters to show it. */
  myInvite: { alias: string | null; status: InviteStatus } | null;
};

export type ReferralCodeView = { code: string; alias: string | null; program: ReferralProgram | null };

/** Status shown for a Referral row; null hides it (a FAILED arm never reached the contract). */
export function inviteStatus(row: { status: string; expiresAt: Date | null }, now: Date): InviteStatus | null {
  if (row.status === "REWARDED") return "rewarded";
  if (row.status === "FAILED") return null;
  if (row.status === "ARMED" && row.expiresAt && row.expiresAt < now) return "expired";
  return "pending";
}

/** i18n key under `referral` for a friend's row. Never "you earned 0". */
export function friendStatus(friend: InvitedFriend): {
  key: "statusPending" | "statusExpired" | "statusRewarded" | "statusRewardedNoBonus";
  points?: string;
} {
  if (friend.status === "pending") return { key: "statusPending" };
  if (friend.status === "expired") return { key: "statusExpired" };
  if (friend.referrerBonus && BigInt(friend.referrerBonus) > 0n) return { key: "statusRewarded", points: friend.referrerBonus };
  return { key: "statusRewardedNoBonus" };
}
