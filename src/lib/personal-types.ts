import type { Address, Hex } from "viem";
import type { Currency } from "./money";
export const personalAccessTypes = { PersonalAccess: [
  { name: "account", type: "address" }, { name: "payload", type: "string" }, { name: "deadline", type: "uint256" },
] } as const;
export type PersonalView = {
  id: string; kind: "DIRECT" | "REQUEST"; recipient: Address; recipientName: string;
  expectedPayer: string | null; payer: string | null; payerName: string | null;
  localAmount: string; localCurrency: Currency; usdAmount: string;
  status: string; note: string; expiresAt: string; paidAt: string | null;
  readAt: string | null; txHash: string | null;
};
export const personalPayTypes = {
  PersonalPayment: [
    { name: "payer", type: "address" }, { name: "recipient", type: "address" },
    { name: "id", type: "string" }, { name: "amount", type: "uint256" },
    { name: "spender", type: "address" }, { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;
export type PersonalAuthorization = {
  payer: Address; recipient: Address; id: string; amount: string; spender: Address;
  nonce: string; deadline: string; signature: Hex; permitSignature: Hex;
};
