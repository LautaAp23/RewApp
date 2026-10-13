import QRCode from "qrcode";
import { personalView } from "@/lib/server/personal-view";
import { refreshPersonal, resumePersonal } from "@/lib/server/personal-payments";
import { workspaceAccount } from "@/lib/server/workspace-auth";
import { getRelayer } from "@/lib/server/relayer";
import { publicClient } from "@/lib/server/chain";
import { contractAddresses, usdrAbi } from "@/lib/contracts";
import { getAddress } from "viem";

type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Params) {
  const account = await workspaceAccount();
  if (!account) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let row = await refreshPersonal(id);
  if (!row || (row.recipient !== account &&
      ((row.expectedPayer && row.expectedPayer !== account) || (row.payer && row.payer !== account)))) return Response.json({ error: "not_found" }, { status: 404 });
  if (row.status === "PROCESSING" && row.payer === account) {
    try { row = await resumePersonal(id); } catch { /* Keep the durable state and allow retry. */ }
  }
  if (!row) return Response.json({ error: "not_found" }, { status: 404 });
  const url = `${new URL(request.url).origin}/pagar/p2p_${id}`;
  const ownRequest = row.kind === "REQUEST" && row.recipient === account;
  const nonce = contractAddresses.usdr ? await publicClient.readContract({ address: contractAddresses.usdr, abi: usdrAbi, functionName: "nonces", args: [getAddress(account)] }) : null;
  return Response.json({ ...personalView(row), spender: getRelayer().account.address, nonce: nonce?.toString(), url,
    qrDataUrl: ownRequest && !row.expectedPayer ? await QRCode.toDataURL(url, { width: 320, margin: 3, errorCorrectionLevel: "M" }) : null,
  }, { headers: { "Cache-Control": "no-store" } });
}
