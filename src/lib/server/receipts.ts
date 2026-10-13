import "server-only";
import type { Onramp } from "@prisma/client";
import { getAddress, isAddress, isHash, isHex, type Address } from "viem";
import { db } from "../db";
import { publicClient } from "./chain";
import { contractAddresses } from "../contracts";
import { verifySignedRequest } from "../api/signed-request";
import { viewReceiptTypes } from "../api/typed-data";
import { isReceiptKind, receiptSettlement, receiptTopUp, type ReceiptView } from "../api/receipt";
import { isCurrency } from "../money";
import { matchingPersonalTransfer, refreshPersonal } from "./personal-payments";
import { accountCode } from "../account-code";

const fail = (error: string, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function confirmedTopUp(row: Onramp): Promise<ReceiptView | null> {
  const token = contractAddresses.usdr;
  if (!row.txHash || !isHash(row.txHash) || !token || !isCurrency(row.currency)) return null;
  const receipt = await publicClient.getTransactionReceipt({ hash: row.txHash });
  if (receipt.status !== "success" || !receiptTopUp(receipt.logs, { token, account: getAddress(row.address), amount: row.usdAmount })) return null;
  const block = await publicClient.getBlock({ blockHash: receipt.blockHash });
  const paidAt = new Date(Number(block.timestamp) * 1000).toISOString();
  if (!row.confirmedAt) await db.onramp.update({ where: { id: row.id }, data: { confirmedAt: new Date(paidAt) } });
  return { kind: "topup", id: row.id, merchant: "RewApp", localAmount: row.localAmount.toFixed(2), localCurrency: row.currency,
    usdAmount: row.usdAmount.toString(), txHash: row.txHash, paidAt, merchantReward: "0" };
}

async function paymentReceipt(id: string, account: Address): Promise<ReceiptView | null> {
  const charge = await db.charge.findUnique({ where: { id }, include: { merchant: true } });
  if (!charge || charge.payer?.toLowerCase() !== account.toLowerCase() || charge.status !== "PAID" || !charge.txHash || !isHash(charge.txHash)) return null;
  const contract = contractAddresses.rewAppPay;
  if (!contract || !isCurrency(charge.localCurrency)) return null;
  const receipt = await publicClient.getTransactionReceipt({ hash: charge.txHash });
  if (receipt.status !== "success") return null;
  const settled = receiptSettlement(receipt.logs, { contract, id: charge.id, payer: account, merchant: getAddress(charge.merchant.address), amount: charge.usdAmount });
  if (!settled) return null;
  const block = await publicClient.getBlock({ blockHash: receipt.blockHash });
  return { kind: "payment", id: charge.id, merchant: charge.merchant.name, localAmount: charge.localAmount.toFixed(2), localCurrency: charge.localCurrency,
    usdAmount: charge.usdAmount.toString(), txHash: charge.txHash, paidAt: new Date(Number(block.timestamp) * 1000).toISOString(),
    merchantReward: settled.args.merchantReward.toString() };
}

/** Shared ownership and confirmation checks for every implemented monetary operation. */
export async function handleReceiptRequest(request: Request, kind: string, id: string) {
  if (!isReceiptKind(kind)) return fail("not_found", 404);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => !["accountAddress", "deadline", "signature"].includes(key)) ||
      typeof body.accountAddress !== "string" || !isAddress(body.accountAddress) ||
      typeof body.deadline !== "string" || !/^\d{1,12}$/.test(body.deadline) ||
      typeof body.signature !== "string" || !isHex(body.signature) || body.signature.length !== 132) return fail("invalid_request", 400);
  const account = getAddress(body.accountAddress);
  const deadline = BigInt(body.deadline);
  const verified = await verifySignedRequest({ signer: account, types: viewReceiptTypes, primaryType: "ViewReceipt",
    message: { account, operation: id, kind, deadline }, deadline, signature: body.signature, fresh: true });
  if (verified !== "ok") return fail("invalid_signature", 401);
  try {
    let view: ReceiptView | null;
    if (kind === "transfer") {
      const row = await refreshPersonal(id), token = contractAddresses.usdr;
      view = null;
      if (row?.status === "PAID" && row.txHash && isHash(row.txHash) && token && isCurrency(row.localCurrency) &&
          (row.payer === account || row.recipient === account)) {
        const receipt = await publicClient.getTransactionReceipt({ hash: row.txHash });
        if (receipt.status === "success" && matchingPersonalTransfer(receipt.logs, row, token)) {
          const block = await publicClient.getBlock({ blockHash: receipt.blockHash });
          view = { kind, id: row.id, merchant: row.recipientName, localAmount: row.localAmount.toFixed(2), localCurrency: row.localCurrency,
            usdAmount: row.usdAmount.toString(), paidAt: new Date(Number(block.timestamp) * 1000).toISOString(), txHash: row.txHash, merchantReward: "0",
            sender: row.payerName ?? "", senderAccount: accountCode(getAddress(row.payer!)), recipientAccount: accountCode(getAddress(row.recipient)) };
        }
      }
    }
    else if (kind === "payment") view = await paymentReceipt(id, account);
    else {
      const row = await db.onramp.findUnique({ where: { id } });
      view = row?.address.toLowerCase() === account.toLowerCase() ? await confirmedTopUp(row) : null;
    }
    return view ? Response.json(view, { headers: { "Cache-Control": "no-store" } }) : fail("not_found", 404);
  } catch { return fail("unavailable", 503); }
}
