import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { checkCardRequest } from "@/lib/api/card-request";
import { validCardMetadata, type CardMetadata } from "@/lib/card-metadata";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const allowed = ["accountAddress", "deadline", "signature", "brand", "last4", "holder", "expiryMonth", "expiryYear"];
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !allowed.includes(key))) {
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  const card: CardMetadata = { brand: body.brand, last4: body.last4, holder: body.holder, expiryMonth: body.expiryMonth, expiryYear: body.expiryYear };
  if (!validCardMetadata(card)) return Response.json({ error: "INVALID_CARD" }, { status: 400 });
  const userId = await checkCardRequest(body, card);
  if (!userId) return Response.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  try {
    const row = await db.$transaction(async (tx) => {
      await tx.profile.upsert({ where: { address: userId }, create: { address: userId }, update: {} });
      return tx.savedCard.create({ data: { userId, ...card } });
    });
    return Response.json({ id: row.id, status: row.status }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ error: "CARD_EXISTS" }, { status: 409 });
    throw error;
  }
}
