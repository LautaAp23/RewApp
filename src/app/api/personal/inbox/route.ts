import { getAddress, isAddress, isHex } from "viem";
import { db } from "@/lib/db";
import { verifySignedRequest } from "@/lib/api/signed-request";
import { personalAccessTypes } from "@/lib/personal-types";
import { personalView } from "@/lib/server/personal-view";
import { ensureWorkspaceSession } from "@/lib/server/workspace-auth";
import { parseInboxReadIds } from "@/lib/notification-inbox";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || !isAddress(body.account ?? "") || typeof body.deadline !== "string" || !/^\d{1,12}$/.test(body.deadline) ||
      !isHex(body.signature) || typeof body.payload !== "string" || body.payload.length > 5000) return Response.json({ error: "invalid_request" }, { status: 400 });
  const account = getAddress(body.account), deadline = BigInt(body.deadline);
  const checked = await verifySignedRequest({ signer: account, types: personalAccessTypes, primaryType: "PersonalAccess",
    message: { account, payload: body.payload, deadline }, deadline, signature: body.signature, fresh: true });
  if (checked !== "ok") return Response.json({ error: "unauthorized" }, { status: 401 });
  const ids = (() => { try { return JSON.parse(body.payload); } catch { return null; } })();
  const acknowledgements = parseInboxReadIds(ids);
  if (!acknowledgements) return Response.json({ error: "invalid_request" }, { status: 400 });
  await ensureWorkspaceSession(account);
  if (acknowledgements.personal.length) await db.personalCharge.updateMany({ where: { expectedPayer: account, id: { in: acknowledgements.personal }, kind: "REQUEST", readAt: null }, data: { readAt: new Date() } });
  if (acknowledgements.splits.length) await db.charge.updateMany({ where: { expectedPayer: account, parentId: { not: null }, id: { in: acknowledgements.splits }, notificationReadAt: null }, data: { notificationReadAt: new Date() } });
  const blocks = await db.paymentRequestBlock.findMany({ where: { owner: account }, select: { sender: true } });
  const rows = await db.personalCharge.findMany({ where: { expectedPayer: account, kind: "REQUEST", recipient: { notIn: blocks.map(b => b.sender) }, status: "PENDING", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 50 });
  const splits = await db.charge.findMany({ where: { expectedPayer: account, parentId: { not: null }, status: "PENDING", expiresAt: { gt: new Date() } },
    select: { id: true, localCurrency: true, localAmount: true, notificationReadAt: true, merchant: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
  return Response.json({ charges: rows.map(personalView), splits: splits.map(row => ({ id: row.id, merchantName: row.merchant.name, localCurrency: row.localCurrency, localAmount: row.localAmount.toFixed(2), readAt: row.notificationReadAt?.toISOString() ?? null })) }, { headers: { "Cache-Control": "no-store" } });
}
