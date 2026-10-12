import "server-only";
import { parseEventLogs, type Hash } from "viem";
import { db } from "@/lib/db";
import { rewAppPayAbi, contractAddresses } from "@/lib/contracts";
import { publicClient } from "@/lib/server/chain";
export async function reconcileRedemption(id: string) {
  const item = await db.redemption.findUnique({ where: { id } });
  if (!item || item.status !== "PROCESSING" || !item.txHash) return item;
  const receipt = await publicClient
    .getTransactionReceipt({ hash: item.txHash as Hash })
    .catch(() => null);
  if (!receipt) return item;
  const [event] = parseEventLogs({
    abi: rewAppPayAbi,
    eventName: "RewardRedeemed",
    logs: receipt.logs.filter(
      (l) =>
        l.address.toLowerCase() === contractAddresses.rewAppPay?.toLowerCase(),
    ),
  });
  const valid =
    receipt.status === "success" &&
    event &&
    event.args.account.toLowerCase() === item.account.toLowerCase() &&
    event.args.rewardId === BigInt(item.rewardId);
  return db.redemption.update({
    where: { id },
    data: valid ? { status: "READY", pointsCost: Number(event.args.pointsCost) } : { status: "FAILED", nonce: `${item.nonce}:failed:${item.id}` },
  });
}
export async function reconcileRedemptions(account: string) {
  const merchant = await db.merchant.findUnique({
    where: { address: account },
  });
  const items = await db.redemption.findMany({
    where: {
      status: "PROCESSING",
      txHash: { not: null },
      OR: [{ account }, ...(merchant ? [{ merchantId: merchant.id }] : [])],
    },
    take: 30,
  });
  await Promise.all(items.map((i) => reconcileRedemption(i.id)));
}
