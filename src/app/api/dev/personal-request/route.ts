import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { workspaceAccount } from "@/lib/server/workspace-auth";
import { localToUsdr } from "@/lib/money";
import fixtures from "@/lib/demo-contacts.json";

/** Creates an incoming test request, never a payment authorization. Local testnet only. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development" || Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143) !== 10143 ||
      !process.env.DATABASE_URL || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname)) return new Response(null, { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403 });
  const account = await workspaceAccount();
  if (!account) return Response.json({ error: "unauthorized" }, { status: 401 });
  const sender = fixtures.find(f => f.address !== account)!;
  try {
    const row = await db.$transaction(async tx => {
      const payer = await tx.$queryRaw<{ address: string }[]>`SELECT "address" FROM "Profile" WHERE "address" = ${account} FOR UPDATE`;
      if (!payer.length) throw new Error("unknown_contact");
      if (await tx.paymentRequestBlock.findUnique({ where: { owner_sender: { owner: account, sender: sender.address } } })) throw new Error("requests_blocked");
      const recent = await tx.personalCharge.count({ where: { expectedPayer: account, recipient: sender.address, kind: "REQUEST", createdAt: { gt: new Date(Date.now() - 60_000) } } });
      if (recent >= 5) throw new Error("too_many_requests");
      const rate = await tx.fxRate.findUnique({ where: { currency: "ARS" } });
      if (!rate) throw new Error("invalid_request");
      await tx.profile.upsert({ where: { address: sender.address }, create: sender, update: {} });
      return tx.personalCharge.create({ data: { id: randomUUID(), kind: "REQUEST", recipient: sender.address, recipientName: sender.alias,
        expectedPayer: account, localAmount: "5000", localCurrency: "ARS", usdAmount: localToUsdr("5000", rate.usdRate.toString()), note: "",
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } });
    });
    return Response.json({ id: row.id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error && ["requests_blocked", "too_many_requests", "unknown_contact"].includes(error.message) ? error.message : "failed";
    return Response.json({ error: code }, { status: code === "failed" ? 500 : 409 });
  }
}
