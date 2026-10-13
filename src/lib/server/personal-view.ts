import "server-only";
import type { PersonalCharge } from "@prisma/client";
import { getAddress } from "viem";
import type { PersonalView } from "../personal-types";
import { isCurrency } from "../money";
export function personalView(row: PersonalCharge): PersonalView {
  if (!isCurrency(row.localCurrency)) throw new Error("invalid_currency");
  return {
    id: row.id, kind: row.kind as PersonalView["kind"], recipient: getAddress(row.recipient),
    recipientName: row.recipientName, expectedPayer: row.expectedPayer,
    payer: row.payer, payerName: row.payerName, localAmount: row.localAmount.toFixed(2),
    localCurrency: row.localCurrency, usdAmount: row.usdAmount.toString(), status: row.status,
    note: row.note, expiresAt: row.expiresAt.toISOString(), paidAt: row.paidAt?.toISOString() ?? null,
    readAt: row.readAt?.toISOString() ?? null, txHash: row.txHash,
  };
}
