import { getAddress, isAddress, isHex } from "viem";
import { acceptPersonal } from "@/lib/server/personal-payments";
import { personalView } from "@/lib/server/personal-view";
import type { PersonalAuthorization } from "@/lib/personal-types";
import { workspaceAccount } from "@/lib/server/workspace-auth";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "forbidden" }, { status: 403 });
  const account = await workspaceAccount();
  const body = await request.json().catch(() => null);
  if (!account || !body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).sort().join(",") !== ["payer","recipient","id","amount","spender","nonce","deadline","signature","permitSignature"].sort().join(",") ||
      ![body.payer, body.recipient, body.spender].every(v => typeof v === "string" && isAddress(v)) ||
      typeof body.id !== "string" || !/^[a-f0-9-]{36}$/.test(body.id) ||
      ![body.amount, body.nonce, body.deadline].every(v => typeof v === "string" && /^\d{1,78}$/.test(v)) ||
      ![body.signature, body.permitSignature].every(v => isHex(v) && v.length === 132) ||
      getAddress(body.payer) !== account) return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    const row = await acceptPersonal(body as PersonalAuthorization);
    return row ? Response.json(personalView(row), { status: row.status === "PAID" ? 200 : 202 }) : Response.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    const known = ["insufficient_funds", "payer_busy", "charge_unavailable", "already_processing", "payment_mismatch", "expired_signature", "invalid_signature", "not_found", "forbidden", "authorization_failed"];
    const code = error instanceof Error && known.includes(error.message) ? error.message : "service_unavailable";
    return Response.json({ error: code }, { status: code === "service_unavailable" ? 503 : 409 });
  }
}
