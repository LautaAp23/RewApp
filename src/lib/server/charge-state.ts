import "server-only";
import { type Hash, parseEventLogs } from "viem";
import { db } from "@/lib/db";
import { contractAddresses, rewAppPayAbi } from "@/lib/contracts";
import { publicClient } from "@/lib/server/chain";
import { recordReferralReward } from "@/lib/server/referrals";
export async function refreshCharge(id: string) {
  let charge = await db.charge.findUnique({
    where: { id },
    include: { merchant: true },
  });
  if (!charge) return null;
  if (charge.status === "PROCESSING" && charge.txHash) {
    const receipt = await publicClient
      .getTransactionReceipt({ hash: charge.txHash as Hash })
      .catch(() => null);
    if (receipt) {
      const [event] = parseEventLogs({
        abi: rewAppPayAbi,
        eventName: "PaymentSettled",
        logs: receipt.logs.filter(
          (l) =>
            l.address.toLowerCase() ===
            contractAddresses.rewAppPay?.toLowerCase(),
        ),
      });
      await db.charge.updateMany({
        where: { id, status: "PROCESSING" },
        data:
          receipt.status === "success" && event
            ? { status: "PAID", payer: event.args.payer }
            : { status: "PENDING", txHash: null },
      });
      if (receipt.status === "success" && event) {
        await recordReferralReward(receipt.logs, charge.txHash as Hash).catch((error) =>
          console.error("referral record failed", error),
        );
      }
    }
  }
  if (charge.status === "PENDING" && charge.expiresAt <= new Date())
    await db.charge.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
  if (
    charge.status === "SPLIT" ||
    (charge.status === "EXPIRED" && charge.splitOwner)
  ) {
    const parts = await db.charge.findMany({
      where: { parentId: id },
      select: { id: true, status: true },
    });
    await Promise.all(
      parts
        .filter((p) => p.status === "PROCESSING" || p.status === "PENDING")
        .map((p) => refreshCharge(p.id)),
    );
    const unpaid = await db.charge.count({
      where: { parentId: id, status: { not: "PAID" } },
    });
    if (parts.length && unpaid && charge.expiresAt <= new Date())
      await db.charge.updateMany({
        where: { id, status: "SPLIT" },
        data: { status: "EXPIRED" },
      });
    if (parts.length && !unpaid)
      await db.charge.updateMany({
        where: { id, status: { in: ["SPLIT", "EXPIRED"] } },
        data: { status: "PAID" },
      });
  }
  charge = await db.charge.findUnique({
    where: { id },
    include: { merchant: true },
  });
  return charge;
}
