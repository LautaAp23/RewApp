import { db } from "@/lib/db";
import { workspaceAccount } from "@/lib/server/workspace-auth";
import { personalView } from "@/lib/server/personal-view";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await workspaceAccount();
  if (!account) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const contact = await db.contact.findFirst({ where: { id, owner: account } });
  if (!contact) return Response.json({ error: "not_found" }, { status: 404 });
  const rows = await db.personalCharge.findMany({ where: { status: "PAID", OR: [
    { payer: account, recipient: contact.address }, { payer: contact.address, recipient: account },
  ] }, orderBy: { paidAt: "desc" }, take: 30 });
  return Response.json({ movements: rows.map(personalView) }, { headers: { "Cache-Control": "no-store" } });
}
