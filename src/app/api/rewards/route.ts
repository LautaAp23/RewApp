import { contractAddresses, rewAppPayAbi } from "@/lib/contracts";
import { db } from "@/lib/db";
import { publicClient } from "@/lib/server/chain";
export async function GET(request: Request) {
  const audience =
    new URL(request.url).searchParams.get("audience")?.toUpperCase() ===
    "COMMERCE"
      ? "COMMERCE"
      : "CUSTOMER";
  const expected = audience === "COMMERCE" ? 1 : 0;
  const items = await db.platformReward.findMany({
    where: { audience, active: true },
    include: { merchant: { select: { name: true } } },
    orderBy: { id: "asc" },
  });
  const rewards = await Promise.all(
    items.map(async (r) => {
      try {
        if (!contractAddresses.rewAppPay) throw new Error("not_configured");
        const [pointsCost, audience, active, exists] =
          await publicClient.readContract({
            address: contractAddresses.rewAppPay,
            abi: rewAppPayAbi,
            functionName: "rewards",
            args: [BigInt(r.id)],
          });
        return {
          id: r.id,
          title: r.title,
          description: r.description,
          imageUrl: r.imageUrl,
          merchant: r.merchant,
          merchantId: r.merchantId ?? null,
          pointsCost: pointsCost.toString(),
          available: exists && active && audience === expected,
        };
      } catch {
        return {
          id: r.id,
          title: r.title,
          description: r.description,
          imageUrl: r.imageUrl,
          merchant: r.merchant,
          merchantId: r.merchantId ?? null,
          pointsCost: r.pointsCost.toString(),
          available: false,
        };
      }
    }),
  );
  return Response.json(
    { rewards },
    { headers: { "Cache-Control": "no-store" } },
  );
}
