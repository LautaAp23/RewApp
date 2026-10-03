import { db } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ credentialId: string }> },
): Promise<Response> {
  const { credentialId } = await params;
  const backup = await db.backupVault.findUnique({ where: { credentialId } });
  if (!backup) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({
    accountAddress: backup.accountAddress,
    vault: backup.vault,
  });
}
