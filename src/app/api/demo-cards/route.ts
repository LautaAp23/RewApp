import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAddress, isAddress, isHex } from "viem";
import { db } from "@/lib/db";
import { findDemoCard } from "@/lib/demo-cards";
import { verifySignedRequest } from "@/lib/api/signed-request";
import { addDemoCardTypes } from "@/lib/api/typed-data";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

// Public, account-scoped fictional metadata, like the demo profile endpoint.
// Real payment methods will require private provider-backed access instead.
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("account");
  if (!address || !isAddress(address)) return fail("INVALID_ACCOUNT", 400);
  const rows = await db.savedDemoCard.findMany({
    where: { accountAddress: getAddress(address) }, orderBy: { createdAt: "asc" },
  });
  const cards = rows.flatMap((row) => {
    const fixture = findDemoCard(row.demoId);
    return fixture ? [{ id: row.id, brand: fixture.brand, last4: fixture.last4, funding: fixture.funding, isDemo: true }] : [];
  });
  return NextResponse.json({ cards }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => !["accountAddress", "demoId", "deadline", "signature"].includes(key))) {
    return fail("INVALID_REQUEST", 400);
  }
  const { accountAddress, demoId, deadline, signature } = body;
  if (typeof accountAddress !== "string" || !isAddress(accountAddress) || !findDemoCard(demoId) ||
      typeof deadline !== "string" || !/^\d{1,12}$/.test(deadline) ||
      typeof signature !== "string" || !isHex(signature) || signature.length !== 132) return fail("INVALID_REQUEST", 400);
  const expiry = BigInt(deadline);
  const address = getAddress(accountAddress);
  const checked = await verifySignedRequest({
    signer: address, types: addDemoCardTypes, primaryType: "AddDemoCard",
    message: { account: address, demoId, deadline: expiry },
    deadline: expiry, signature, fresh: true,
  });
  if (checked === "expired_signature") return fail("EXPIRED_SIGNATURE", 401);
  if (checked !== "ok") return fail("INVALID_SIGNATURE", 401);
  try {
    const row = await db.savedDemoCard.create({ data: { accountAddress: address, demoId } });
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return fail("CARD_EXISTS", 409);
    throw error;
  }
}
