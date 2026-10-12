import { parseEventLogs, type Address, type Hash, type Log } from "viem";
import { chargeIdToBytes32, rewAppPayAbi, usdrAbi } from "../contracts";
import type { Currency } from "../money";

export type ReceiptKind = "payment" | "topup" | "transfer";
export function isReceiptKind(value: unknown): value is ReceiptKind { return value === "payment" || value === "topup" || value === "transfer"; }
export function receiptHref(kind: ReceiptKind, id: string) { return `/comprobante/${encodeURIComponent(id)}?tipo=${kind}`; }

export type ReceiptView = {
  kind: ReceiptKind;
  id: string;
  merchant: string;
  localAmount: string;
  localCurrency: Currency;
  usdAmount: string;
  paidAt: string;
  txHash: Hash;
  merchantReward: string;
};

/** A top-up receipt must prove a mint of the expected token to the correct account. */
export function receiptTopUp(logs: Log[], expected: { token: Address; account: Address; amount: bigint }) {
  return parseEventLogs({ abi: usdrAbi, eventName: "Transfer", logs }).find((event) =>
    event.address.toLowerCase() === expected.token.toLowerCase() &&
    event.args.from === "0x0000000000000000000000000000000000000000" &&
    event.args.to.toLowerCase() === expected.account.toLowerCase() && event.args.value === expected.amount);
}

/** A receipt must match this exact charge, payer, merchant and configured contract. */
export function receiptSettlement(logs: Log[], expected: { contract: Address; id: string; payer: Address; merchant: Address; amount: bigint }) {
  return parseEventLogs({ abi: rewAppPayAbi, eventName: "PaymentSettled", logs }).find((event) =>
    event.address.toLowerCase() === expected.contract.toLowerCase() &&
    event.args.chargeId === chargeIdToBytes32(expected.id) &&
    event.args.payer.toLowerCase() === expected.payer.toLowerCase() &&
    event.args.merchant.toLowerCase() === expected.merchant.toLowerCase() &&
    event.args.amount === expected.amount);
}
