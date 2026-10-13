import "server-only";
import type { Referral } from "@prisma/client";
import { getAddress, parseEventLogs, type Hash, type Log } from "viem";
import type { ReferralProgram } from "@/lib/api/referrals";
import { contractAddresses, rewAppPayAbi } from "@/lib/contracts";
import { db } from "@/lib/db";
import { publicClient } from "@/lib/server/chain";

const DAY_SECONDS = 86_400n;
/** An ARMING row without a hash after this long never broadcast: let the account claim again. */
const UNSENT_ARM_MS = 10 * 60 * 1000;

const ours = (logs: Log[]) =>
  logs.filter((log) => log.address.toLowerCase() === contractAddresses.rewAppPay?.toLowerCase());

/** The program as the contract has it now. Null when the contract is not configured or unreadable. */
export async function readReferralProgram(): Promise<ReferralProgram | null> {
  const address = contractAddresses.rewAppPay;
  if (!address) return null;
  const read = (functionName: "referrerBonus" | "refereeBonus" | "referralMinAmount" | "referralWindow") =>
    publicClient.readContract({ address, abi: rewAppPayAbi, functionName });
  try {
    const [referrerBonus, refereeBonus, minAmount, window] = await Promise.all([
      read("referrerBonus"), read("refereeBonus"), read("referralMinAmount"), read("referralWindow"),
    ]);
    return {
      referrerBonus: referrerBonus.toString(),
      refereeBonus: refereeBonus.toString(),
      minAmount: minAmount.toString(),
      windowDays: Number(window / DAY_SECONDS),
      active: window > 0n,
    };
  } catch (error) {
    console.error("referral program read failed", error);
    return null;
  }
}

/**
 * Records the ReferralRewarded event of a payment receipt. Called wherever a charge becomes PAID with its
 * receipt (/api/pay and refreshCharge). Returns what the payer earned for the payment screen.
 */
export async function recordReferralReward(logs: Log[], txHash: Hash) {
  const [event] = parseEventLogs({ abi: rewAppPayAbi, eventName: "ReferralRewarded", logs: ours(logs) });
  if (!event) return null;
  const { referrer, referee, referrerBonus, refereeBonus } = event.args;
  await db.referral.updateMany({
    where: { referee: getAddress(referee) },
    data: {
      status: "REWARDED",
      rewardTxHash: txHash,
      referrerBonus: referrerBonus.toString(),
      refereeBonus: refereeBonus.toString(),
      rewardedAt: new Date(),
    },
  });
  const profile = await db.profile.findUnique({ where: { address: getAddress(referrer) }, select: { alias: true } });
  return { refereeBonus: refereeBonus.toString(), referrerAlias: profile?.alias ?? null };
}

/** Moves ARMING/ARMED rows forward from the chain. Any other status is returned as is. */
export async function reconcileReferral(row: Referral, now = new Date()): Promise<Referral> {
  const address = contractAddresses.rewAppPay;
  if (!address) return row;
  if (row.status === "ARMING") {
    if (!row.armTxHash) {
      if (now.getTime() - row.createdAt.getTime() < UNSENT_ARM_MS) return row;
      return db.referral.update({ where: { referee: row.referee }, data: { status: "FAILED" } });
    }
    const receipt = await publicClient.getTransactionReceipt({ hash: row.armTxHash as Hash }).catch(() => null);
    if (!receipt) return row;
    const [event] = parseEventLogs({ abi: rewAppPayAbi, eventName: "ReferralSet", logs: ours(receipt.logs) });
    const armed = receipt.status === "success" && event && event.args.referee.toLowerCase() === row.referee.toLowerCase();
    return db.referral.update({
      where: { referee: row.referee },
      data: armed
        ? { status: "ARMED", expiresAt: new Date(Number(event.args.expiresAt) * 1000) }
        : { status: "FAILED" },
    });
  }
  if (row.status === "ARMED") {
    const onchain = await publicClient
      .readContract({ address, abi: rewAppPayAbi, functionName: "referrals", args: [getAddress(row.referee)] })
      .catch(() => null);
    if (onchain?.[2]) {
      return db.referral.update({ where: { referee: row.referee }, data: { status: "REWARDED", rewardedAt: now } });
    }
  }
  return row;
}
