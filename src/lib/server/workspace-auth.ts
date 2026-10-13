import "server-only";
import { createHash } from "node:crypto";
import { randomBytes } from "node:crypto";
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

/** A signed read proof can restore the private read session without another passkey prompt. */
export async function ensureWorkspaceSession(account: string) {
  const jar = await cookies(), token = jar.get("rewapp-workspace")?.value;
  const existing = token ? await db.workspaceSession.findUnique({ where: { tokenHash: sessionHash(token) } }) : null;
  if (existing?.account === account && existing.expiresAt.getTime() > Date.now() + 5 * 60_000) return;
  const value = existing?.account === account ? token! : randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  await db.workspaceSession.upsert({ where: { tokenHash: sessionHash(value) }, create: { tokenHash: sessionHash(value), account, expiresAt }, update: { expiresAt } });
  jar.set("rewapp-workspace", value, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/api", expires: expiresAt });
}
