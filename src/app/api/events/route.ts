import { getAddress } from "viem";
import { db } from "@/lib/db";
import { workspaceAccount } from "@/lib/server/workspace-auth";

const fail = (error: string, status: number) => Response.json({ error }, { status });

const MAX_TITLE = 80;
const MAX_DESCRIPTION = 280;
const MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ACTIVE = 50;

/** Public feed: active, non-expired merchant events with merchant identity. */
export async function GET() {
  const now = new Date();
  const events = await db.merchantEvent.findMany({
    where: { active: true, endsAt: { gt: now } },
    include: { merchant: { select: { name: true, city: true, country: true, address: true } } },
    orderBy: { createdAt: "desc" },
    take: MAX_ACTIVE,
  });
  return Response.json(
    {
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        city: e.city,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
        merchant: e.merchant,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Body: { title, description, startsAt, endsAt } as ISO strings.
 * Auth: workspace session cookie; the session account must own a merchant.
 * The event city is copied from the merchant server-side.
 */
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return fail("forbidden", 403);
  const account = await workspaceAccount();
  if (!account) return fail("unauthorized", 401);
  const merchant = await db.merchant.findUnique({
    where: { address: getAddress(account) },
  });
  if (!merchant) return fail("not_merchant", 403);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const startsAt = typeof body?.startsAt === "string" ? new Date(body.startsAt) : null;
  const endsAt = typeof body?.endsAt === "string" ? new Date(body.endsAt) : null;
  if (
    title.length < 2 ||
    title.length > MAX_TITLE ||
    description.length < 2 ||
    description.length > MAX_DESCRIPTION ||
    !startsAt ||
    !endsAt ||
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime())
  ) {
    return fail("invalid_request", 400);
  }
  const now = new Date();
  if (endsAt <= now || startsAt >= endsAt || endsAt.getTime() - startsAt.getTime() > MAX_WINDOW_MS) {
    return fail("invalid_request", 400);
  }

  const [activeCount, recentCount] = await Promise.all([
    db.merchantEvent.count({
      where: { merchantId: merchant.id, active: true, endsAt: { gt: now } },
    }),
    db.merchantEvent.count({
      where: { merchantId: merchant.id, createdAt: { gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    }),
  ]);
  if (activeCount > 0) return fail("event_active_exists", 409);
  if (recentCount > 0) return fail("event_rate_limited", 429);

  const event = await db.merchantEvent.create({
    data: {
      merchantId: merchant.id,
      title,
      description,
      city: merchant.city,
      startsAt,
      endsAt,
    },
  });
  return Response.json(
    {
      id: event.id,
      title: event.title,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
    },
    { status: 201 },
  );
}
