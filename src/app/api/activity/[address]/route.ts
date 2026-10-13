import { getAddress, isAddress } from "viem";
import type { Activity, ActivityMerchant } from "@/lib/api/activity";
import { contractAddresses, rewAppPayAbi, usdrAbi } from "@/lib/contracts";
import { db } from "@/lib/db";
import type { Currency } from "@/lib/money";
import { publicClient } from "@/lib/server/chain";
import { receiptHref } from "@/lib/api/receipt";
import { confirmedTopUp } from "@/lib/server/receipts";
import { deriveStreak, utcDay, type Streak } from "@/lib/streak";

type Params = { params: Promise<{ address: string }> };

const HISTORY_LIMIT = 20;
const VISIT_BONUS = 1;

async function readChain(account: `0x${string}`, merchants: { name: string; logoUrl: string | null; address: string }[]) {
  const { usdr, rewAppPay } = contractAddresses;
  if (!usdr || !rewAppPay) return null;
  const pay = { address: rewAppPay, abi: rewAppPayAbi } as const;
  try {
    const [balance, points, perMerchant] = await Promise.all([
      publicClient.readContract({ address: usdr, abi: usdrAbi, functionName: "balanceOf", args: [account] }),
      publicClient.readContract({ ...pay, functionName: "customerPoints", args: [account] }),
      Promise.all(
        merchants.map(async (merchant): Promise<ActivityMerchant> => {
          const address = getAddress(merchant.address);
          const [visits, rule] = await Promise.all([
            publicClient.readContract({ ...pay, functionName: "visits", args: [account, address] }),
            publicClient.readContract({ ...pay, functionName: "rules", args: [address, VISIT_BONUS] }),
          ]);
          const [, , , visitsGoal, active] = rule;
          return {
            name: merchant.name,
            logoUrl: merchant.logoUrl,
            address,
            visits: Number(visits),
            visitsGoal: active && visitsGoal > 0 ? visitsGoal : null,
          };
        }),
      ),
    ]);
    return { balance: balance.toString(), points: points.toString(), merchants: perMerchant };
  } catch (error) {
    console.error("activity chain read failed", error);
    return null;
  }
}

/** Streak counters onchain, apart from readChain: an older deployment without them must not hide the balance. */
async function readStreak(account: `0x${string}`): Promise<Streak | null> {
  const { rewAppPay } = contractAddresses;
  if (!rewAppPay) return null;
  try {
    const [lastDay, cycleDay, claimed] = await publicClient.readContract({
      address: rewAppPay,
      abi: rewAppPayAbi,
      functionName: "streaks",
      args: [account],
    });
    return deriveStreak({ cycleDay, lastDay: Number(lastDay), claimed }, utcDay(Date.now()));
  } catch (error) {
    console.error("activity streak read failed", error);
    return null;
  }
}

/** Home screen data: balance, points and streak (onchain), merchants with visits, history. */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { address } = await params;
  if (!isAddress(address)) return Response.json({ error: "invalid_address" }, { status: 400 });
  const account = getAddress(address);

  const [payments, topUps, visited] = await Promise.all([
    db.charge.findMany({
      where: { payer: account, status: "PAID" },
      include: { merchant: true },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
    }),
    db.onramp.findMany({
      where: { address: account, txHash: { not: null } },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
    }),
    db.merchant.findMany({ where: { charges: { some: { payer: account, status: "PAID" } } } }),
  ]);
  const [chain, streak] = await Promise.all([readChain(account, visited), readStreak(account)]);
  // Reconcile historical/submitted top-ups once; only confirmed operations get a receipt link.
  const confirmedTopUps = new Set(topUps.filter((row) => row.confirmedAt).map((row) => row.id));
  await Promise.all(topUps.filter((row) => !row.confirmedAt).map(async (row) => {
    try { if (await confirmedTopUp(row)) confirmedTopUps.add(row.id); } catch { /* Pending or RPC unavailable: retry on the next load. */ }
  }));

  const activity: Activity = {
    balance: chain?.balance ?? null,
    points: chain?.points ?? null,
    streak,
    merchants:
      chain?.merchants ??
      visited.map((m) => ({ name: m.name, logoUrl: m.logoUrl, address: getAddress(m.address), visits: 0, visitsGoal: null })),
    payments: payments.map((charge) => ({
      receiptHref: charge.txHash ? receiptHref("payment", charge.id) : null,
      id: charge.id,
      merchant: { name: charge.merchant.name, logoUrl: charge.merchant.logoUrl },
      usdAmount: charge.usdAmount.toString(),
      localAmount: charge.localAmount.toFixed(2),
      localCurrency: charge.localCurrency as Currency,
      txHash: charge.txHash,
      createdAt: charge.createdAt.toISOString(),
    })),
    topUps: topUps.map((topUp) => ({
      receiptHref: confirmedTopUps.has(topUp.id) ? receiptHref("topup", topUp.id) : null,
      id: topUp.id,
      usdAmount: topUp.usdAmount.toString(),
      txHash: topUp.txHash,
      createdAt: topUp.createdAt.toISOString(),
    })),
  };
  return Response.json(activity, { headers: { "Cache-Control": "no-store" } });
}
