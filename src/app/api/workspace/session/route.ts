import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sessionHash } from "@/lib/server/workspace-auth";
export async function DELETE(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return new Response(null, { status: 403 });
  const jar = await cookies(),
    token = jar.get("rewapp-workspace")?.value;
  if (token)
    await db.workspaceSession.deleteMany({
      where: { tokenHash: sessionHash(token) },
    });
  jar.set("rewapp-workspace", "", { path: "/api", maxAge: 0 });
  return new Response(null, { status: 204 });
}
