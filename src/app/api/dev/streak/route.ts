import "server-only";
import { encodeFunctionData, getAddress, isAddress } from "viem";
import { contractAddresses, rewAppPayAbi } from "@/lib/contracts";
import { publicClient } from "@/lib/server/chain";
import { durableRelay } from "@/lib/server/durable-relay";
import { getRelayer } from "@/lib/server/relayer";
import { DEMO_STREAK_PRESETS, isDemoStreakPreset, utcDay } from "@/lib/streak";

/**
 * Seeds the streak counters of a demo account (never points) through seedStreakForDemo. The relayer
 * holds the admin role on testnet and the contract only accepts it with `testingEnabled`.
 * Never enabled in production.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== new URL(request.url).origin) return new Response(null, { status: 403 });
  const rewAppPay = contractAddresses.rewAppPay;
  if (!rewAppPay) return Response.json({ error: "not_configured" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { address?: unknown; preset?: unknown } | null;
  if (typeof body?.address !== "string" || !isAddress(body.address) || !isDemoStreakPreset(body.preset)) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const preset = DEMO_STREAK_PRESETS[body.preset];
  // Same day base as the contract: the latest block, not this machine's clock.
  const { timestamp } = await publicClient.getBlock();
  const lastDay = BigInt(utcDay(Number(timestamp) * 1000) - preset.daysAgo);
  const args = [getAddress(body.address), preset.cycleDay, lastDay] as const;

  try {
    await publicClient.simulateContract({
      account: getRelayer().account,
      address: rewAppPay,
      abi: rewAppPayAbi,
      functionName: "seedStreakForDemo",
      args,
    });
    const txHash = await durableRelay(
      rewAppPay,
      encodeFunctionData({ abi: rewAppPayAbi, functionName: "seedStreakForDemo", args }),
      async () => {},
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 30_000 });
    return Response.json(
      { txHash, status: receipt.status, preset: body.preset },
      { status: receipt.status === "success" ? 200 : 502, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("demo streak seed failed", error);
    return Response.json({ error: "seed_failed" }, { status: 502 });
  }
}
