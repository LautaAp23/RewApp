import { db } from "@/lib/db";
import { checkCardRequest } from "@/lib/api/card-request";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => !["accountAddress", "deadline", "signature"].includes(key))) {
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  const userId = await checkCardRequest(body);
  if (!userId) return Response.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  const cards = await db.savedCard.findMany({ where: { userId }, orderBy: { createdAt: "asc" },
    select: { id: true, brand: true, last4: true, funding: true, expiryMonth: true, expiryYear: true, status: true } });
  return Response.json({ cards }, { headers: { "Cache-Control": "no-store" } });
}
