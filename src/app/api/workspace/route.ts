import { refreshCharge } from "@/lib/server/charge-state";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { getAddress, isAddress, isHex, verifyTypedData } from "viem";
import { db } from "@/lib/db";
import { isFreshDeadline, rewAppApiDomain } from "@/lib/api/typed-data";
import {
  workspaceActions,
  workspaceActionTypes,
  type WorkspaceRequest,
} from "@/lib/workspace-types";
import { sessionHash, workspaceAccount } from "@/lib/server/workspace-auth";
import { workspaceMutation, workspaceView } from "@/lib/server/workspace";
import { reconcileRedemptions } from "@/lib/server/redemptions";
const fail = (error: string, status = 400) =>
  Response.json({ error }, { status });
export async function GET(request: Request) {
  const account = await workspaceAccount();
  if (!account) return fail("unauthorized", 401);
  await reconcileRedemptions(account);
  const pending = await db.charge.findMany({
    where: {
      OR: [
        { payer: account, status: "PROCESSING" },
        { splitOwner: account, status: { in: ["SPLIT", "EXPIRED"] } },
        {
          parts: { some: { expectedPayer: account } },
          status: { in: ["SPLIT", "EXPIRED"] },
        },
      ],
    },
    select: { id: true },
    take: 30,
  });
  await Promise.all(pending.map((c) => refreshCharge(c.id)));
  const focus = new URL(request.url).searchParams.get("merchant");
  return Response.json(await workspaceView(account, focus), {
    headers: { "Cache-Control": "no-store" },
  });
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return fail("forbidden", 403);
  const body = (await request
    .json()
    .catch(() => null)) as WorkspaceRequest | null;
  if (
    !body ||
    typeof body.account !== "string" ||
    !isAddress(body.account) ||
    !workspaceActions.includes(body.action) ||
    typeof body.payload !== "string" ||
    body.payload.length > 5000 ||
    typeof body.requestId !== "string" ||
    !/^[a-f0-9-]{36}$/.test(body.requestId) ||
    !isHex(body.signature) ||
    typeof body.deadline !== "string" ||
    !/^\d{1,12}$/.test(body.deadline)
  )
    return fail("invalid_request");
  const account = getAddress(body.account),
    deadline = BigInt(body.deadline);
  if (!isFreshDeadline(deadline)) return fail("expired_signature");
  const valid = await verifyTypedData({
    address: account,
    domain: rewAppApiDomain(Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143)),
    types: workspaceActionTypes,
    primaryType: "WorkspaceAction",
    message: {
      account,
      action: body.action,
      payload: body.payload,
      requestId: body.requestId,
      deadline,
    },
    signature: body.signature,
  }).catch(() => false);
  if (!valid) return fail("invalid_signature", 401);
  const payload = (() => {
    try {
      return JSON.parse(body.payload) as Record<string, unknown>;
    } catch {
      return null;
    }
  })();
  if (!payload || Array.isArray(payload) || typeof payload !== "object")
    return fail("invalid_request");
  try {
    await db.$transaction(async (tx) => {
      await tx.apiAuthorization.create({
        data: { id: body.requestId, account },
      });
      await workspaceMutation(tx, account, body.action, payload);
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return fail("already_used", 409);
    const known = [
      "invalid_request",
      "invalid_participants",
      "invalid_split",
      "unknown_contact",
      "charge_unavailable",
      "invalid_group",
      "not_merchant",
      "not_found",
      "not_ready",
    ];
    if (error instanceof Error && known.includes(error.message))
      return fail(error.message, 409);
    console.error("workspace mutation failed", error);
    return fail("failed", 500);
  }
  const token = randomBytes(32).toString("hex"),
    expiresAt = new Date(Date.now() + 15 * 60_000);
  await db.workspaceSession.create({
    data: { tokenHash: sessionHash(token), account, expiresAt },
  });
  (await cookies()).set("rewapp-workspace", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api",
    expires: expiresAt,
  });
  const focus = typeof payload.merchant === "string" ? payload.merchant : null;
  return Response.json(await workspaceView(account, focus), {
    headers: { "Cache-Control": "no-store" },
  });
}
