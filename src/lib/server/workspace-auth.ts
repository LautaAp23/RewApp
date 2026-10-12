import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
export const sessionHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function workspaceAccount() {
  const token = (await cookies()).get("rewapp-workspace")?.value;
  if (!token) return null;
  const session = await db.workspaceSession.findUnique({
    where: { tokenHash: sessionHash(token) },
  });
  return session && session.expiresAt > new Date() ? session.account : null;
}
