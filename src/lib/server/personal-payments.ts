import "server-only";
import { Prisma, type PersonalCharge } from "@prisma/client";
import { encodeFunctionData, getAddress, isHash, isHex, parseEventLogs, parseSignature, verifyTypedData, type Address, type Hash } from "viem";
import { db } from "../db";
import { contractAddresses, permitTypes, usdrAbi, usdrPermitDomain } from "../contracts";
import { personalPayTypes, type PersonalAuthorization } from "../personal-types";
import { isFreshDeadline, rewAppApiDomain } from "../api/typed-data";
import { durableRelay } from "./durable-relay";
import { publicClient } from "./chain";
import { assertRelayerFunded, getRelayer } from "./relayer";

export function matchingPersonalTransfer(logs: Parameters<typeof parseEventLogs>[0]["logs"], row: Pick<PersonalCharge, "payer" | "recipient" | "usdAmount">, token: Address) {
  return parseEventLogs({ abi: usdrAbi, eventName: "Transfer", logs }).some(event =>
    event.address.toLowerCase() === token.toLowerCase() && event.args.from.toLowerCase() === row.payer?.toLowerCase() &&
    event.args.to.toLowerCase() === row.recipient.toLowerCase() && event.args.value === row.usdAmount);
}

async function settle(row: PersonalCharge) {
  if (!row.txHash || !isHash(row.txHash) || !contractAddresses.usdr) return row;
  const receipt = await publicClient.getTransactionReceipt({ hash: row.txHash }).catch(() => null);
  if (!receipt) return row;
  if (receipt.status === "reverted") {
    // The exact transaction reverted: the allowance is still reserved for this signed payment.
    return db.personalCharge.update({ where: { id: row.id }, data: { txHash: null, txRaw: null } });
  }
  if (!matchingPersonalTransfer(receipt.logs, row, contractAddresses.usdr)) throw new Error("settlement_mismatch");
  const block = await publicClient.getBlock({ blockHash: receipt.blockHash });
  return db.personalCharge.update({ where: { id: row.id }, data: { status: "PAID", paidAt: new Date(Number(block.timestamp) * 1000), payerLock: null } });
}

export async function refreshPersonal(id: string) {
  let row = await db.personalCharge.findUnique({ where: { id } });
  if (!row) return null;
  if (row.status === "PROCESSING") row = await settle(row);
  if (row.status === "PENDING" && row.expiresAt <= new Date()) {
    await db.personalCharge.updateMany({ where: { id, status: "PENDING" }, data: { status: "EXPIRED" } });
    row = await db.personalCharge.findUnique({ where: { id } });
  }
  return row;
}

export function personalIntent(auth: PersonalAuthorization) {
  return { payer: getAddress(auth.payer), recipient: getAddress(auth.recipient), id: auth.id,
    amount: BigInt(auth.amount), spender: getAddress(auth.spender), nonce: BigInt(auth.nonce), deadline: BigInt(auth.deadline) };
}

async function verifyPersonalSignatures(auth: PersonalAuthorization, row: PersonalCharge) {
  const token = contractAddresses.usdr;
  const relayer = getRelayer().account.address;
  const intent = personalIntent(auth);
  if (!token || intent.id !== row.id || intent.recipient !== getAddress(row.recipient) || intent.amount !== row.usdAmount ||
      intent.spender !== relayer || intent.payer === intent.recipient || (row.expectedPayer && intent.payer !== getAddress(row.expectedPayer))) throw new Error("payment_mismatch");
  const [intentOk, permitOk] = await Promise.all([
    verifyTypedData({ address: intent.payer, domain: rewAppApiDomain(publicClient.chain.id), types: personalPayTypes, primaryType: "PersonalPayment", message: intent, signature: auth.signature }).catch(() => false),
    verifyTypedData({ address: intent.payer, domain: usdrPermitDomain(token, publicClient.chain.id), types: permitTypes, primaryType: "Permit",
      message: { owner: intent.payer, spender: relayer, value: intent.amount, nonce: intent.nonce, deadline: intent.deadline }, signature: auth.permitSignature }).catch(() => false),
  ]);
  if (!intentOk || !permitOk) throw new Error("invalid_signature");
  return intent;
}

export async function validatePersonalAuthorization(auth: PersonalAuthorization, row: PersonalCharge) {
  if (!isFreshDeadline(BigInt(auth.deadline))) throw new Error("expired_signature");
  const intent = await verifyPersonalSignatures(auth, row), token = contractAddresses.usdr!;
  if (!(await db.profile.findUnique({ where: { address: intent.payer } }))) throw new Error("unknown_account");
  const [balance, nonce] = await Promise.all([
    publicClient.readContract({ address: token, abi: usdrAbi, functionName: "balanceOf", args: [intent.payer] }),
    publicClient.readContract({ address: token, abi: usdrAbi, functionName: "nonces", args: [intent.payer] }),
  ]);
  if (balance < intent.amount) throw new Error("insufficient_funds");
  if (nonce !== intent.nonce) throw new Error("expired_signature");
}

/** Trusted relayer: exact-value EIP-2612 approval, then transferFrom to the signed recipient.
 * Database CAS + payerLock protect both requests and direct transfers from duplicate spending.
 * Signed raw transactions are saved before broadcasting and can be safely rebroadcast unchanged.
 */
async function execute(id: string) {
  let row = await refreshPersonal(id);
  if (!row || row.status !== "PROCESSING") return row;
  const auth = row.authorization as unknown as PersonalAuthorization;
  const intent = await verifyPersonalSignatures(auth, row);
  if (row.payer !== intent.payer || row.payerLock !== intent.payer) throw new Error("payment_mismatch");
  const token = contractAddresses.usdr!;
  const { account, wallet } = getRelayer();
  await assertRelayerFunded();
  if (!row.permitConfirmed) {
    if (!row.permitHash) {
      const { r, s, v, yParity } = parseSignature(auth.permitSignature);
      const args = [intent.payer, account.address, intent.amount, intent.deadline, Number(v ?? yParity + 27), r, s] as const;
      await publicClient.simulateContract({ account, address: token, abi: usdrAbi, functionName: "permit", args });
      await durableRelay(token, encodeFunctionData({ abi: usdrAbi, functionName: "permit", args }), async (hash, raw) => {
        const saved = await db.personalCharge.updateMany({ where: { id, status: "PROCESSING", payerLock: intent.payer, permitHash: null }, data: { permitHash: hash, permitRaw: raw } });
        if (!saved.count) throw new Error("already_processing");
      });
      row = (await db.personalCharge.findUnique({ where: { id } }))!;
    } else if (row.permitRaw && isHex(row.permitRaw)) {
      await wallet.sendRawTransaction({ serializedTransaction: row.permitRaw }).catch(() => undefined);
    }
    const receipt = await publicClient.waitForTransactionReceipt({ hash: row.permitHash as Hash, timeout: 10_000 });
    if (receipt.status !== "success") {
      // Only a proven revert releases the payer lock. Unknown broadcasts remain recoverable.
      await db.personalCharge.update({ where: { id }, data: { status: "CANCELLED", payerLock: null } });
      throw new Error("authorization_failed");
    }
    row = await db.personalCharge.update({ where: { id }, data: { permitConfirmed: true } });
  }
  if (!row.txHash) {
    const args = [intent.payer, intent.recipient, intent.amount] as const;
    await publicClient.simulateContract({ account, address: token, abi: usdrAbi, functionName: "transferFrom", args });
    await durableRelay(token, encodeFunctionData({ abi: usdrAbi, functionName: "transferFrom", args }), async (hash, raw) => {
      const saved = await db.personalCharge.updateMany({ where: { id, status: "PROCESSING", payerLock: intent.payer, txHash: null }, data: { txHash: hash, txRaw: raw } });
      if (!saved.count) throw new Error("already_processing");
    });
    row = (await db.personalCharge.findUnique({ where: { id } }))!;
  } else if (row.txRaw && isHex(row.txRaw)) {
    await wallet.sendRawTransaction({ serializedTransaction: row.txRaw }).catch(() => undefined);
  }
  await publicClient.waitForTransactionReceipt({ hash: row.txHash as Hash, timeout: 10_000 }).catch(() => undefined);
  return refreshPersonal(id);
}

// One execution per operation in an instance; other instances are excluded by a database advisory lock.
const running = new Map<string, Promise<PersonalCharge | null>>();
export function resumePersonal(id: string) {
  const current = running.get(id);
  if (current) return current;
  const next = db.$transaction(async tx => {
    const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${id}, 0)) AS acquired`;
    if (!lock?.acquired) return db.personalCharge.findUnique({ where: { id } });
    try { return await execute(id); }
    catch (error) {
      const stored = await db.personalCharge.findUnique({ where: { id } });
      // No prepared or broadcast transaction exists, so this attempt cannot settle later.
      if (stored?.status === "PROCESSING" && !stored.permitHash && !stored.txHash) {
        await db.personalCharge.updateMany({ where: { id, status: "PROCESSING", permitHash: null, txHash: null }, data: { status: "PENDING", payerLock: null, payer: null, payerName: null, authorization: Prisma.DbNull } });
      }
      throw error;
    }
  }, { timeout: 45_000 }).finally(() => running.delete(id));
  running.set(id, next);
  return next;
}

export async function acceptPersonal(auth: PersonalAuthorization) {
  const row = await refreshPersonal(auth.id);
  if (!row) throw new Error("not_found");
  if (row.status === "PAID") {
    if (row.payer !== getAddress(auth.payer)) throw new Error("forbidden");
    return row;
  }
  if (row.status === "PROCESSING") {
    if (JSON.stringify(row.authorization) !== JSON.stringify(JSON.parse(JSON.stringify(auth)))) {
      // JSONB normalizes key order; compare canonical fields instead.
      const previous = row.authorization as unknown as PersonalAuthorization;
      if (Object.keys(previous).some(key => previous[key as keyof PersonalAuthorization] !== auth[key as keyof PersonalAuthorization])) throw new Error("already_processing");
    }
    return resumePersonal(row.id);
  }
  if (row.status !== "PENDING" || row.expiresAt <= new Date()) throw new Error("charge_unavailable");
  await validatePersonalAuthorization(auth, row);
  await assertRelayerFunded();
  const payer = getAddress(auth.payer);
  const profile = await db.profile.findUnique({ where: { address: payer } });
  try {
    const reserved = await db.personalCharge.updateMany({ where: { id: row.id, status: "PENDING", expiresAt: { gt: new Date() } }, data: {
      status: "PROCESSING", payer, payerName: profile?.alias || profile?.handle || payer, payerLock: payer, authorization: auth as unknown as Prisma.InputJsonValue,
    } });
    if (!reserved.count) throw new Error("already_processing");
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new Error("payer_busy");
    throw error;
  }
  return resumePersonal(row.id);
}
