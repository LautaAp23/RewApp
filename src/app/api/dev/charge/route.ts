import "server-only";
import QRCode from "qrcode";
import { keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { POST as createCharge } from "@/app/api/charges/route";
import { createChargeTypes, rewAppApiDomain } from "@/lib/api/typed-data";

/** Same public testnet merchant as scripts/demo-charge.mjs. Never enabled in production. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  const origin = new URL(request.url).origin;
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== origin) return new Response(null, { status: 403 });
  const account = privateKeyToAccount(keccak256(toBytes("rewapp.smoke.merchant")));
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
  const message = { merchant: account.address, localAmount: "5000", currency: "ARS", deadline };
  const signature = await account.signTypedData({
    domain: rewAppApiDomain(Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143)),
    types: createChargeTypes, primaryType: "CreateCharge", message,
  });
  const response = await createCharge(new Request(new URL("/api/charges", origin), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...message, deadline: deadline.toString(), signature }),
  }));
  if (!response.ok) return response;
  const charge = await response.json();
  const qrDataUrl = await QRCode.toDataURL(charge.url, { width: 320, margin: 4, errorCorrectionLevel: "M" });
  return Response.json({ ...charge, qrDataUrl }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
