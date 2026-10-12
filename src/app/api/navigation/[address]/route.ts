import { getAddress, isAddress } from "viem";
import { db } from "@/lib/db";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!isAddress(address))
    return Response.json({ error: "invalid_address" }, { status: 400 });
  const merchant = await db.merchant.findUnique({
    where: { address: getAddress(address) },
    select: { id: true },
  });
  return Response.json(
    { merchant: !!merchant },
    { headers: { "Cache-Control": "no-store" } },
  );
}
