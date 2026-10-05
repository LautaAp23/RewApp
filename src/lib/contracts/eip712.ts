import type { Address, Hex } from "viem";
import { monadTestnet } from "viem/chains";

export const rewAppPayDomain = (verifyingContract: Address, chainId: number = monadTestnet.id) =>
  ({ name: "RewAppPay", version: "1", chainId, verifyingContract }) as const;

export const paymentIntentTypes = {
  PaymentIntent: [
    { name: "payer", type: "address" },
    { name: "merchant", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "chargeId", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const redeemIntentTypes = {
  RedeemIntent: [
    { name: "account", type: "address" },
    { name: "rewardId", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const ruleIntentTypes = {
  RuleIntent: [
    { name: "merchant", type: "address" },
    { name: "ruleType", type: "uint8" },
    { name: "minAmount", type: "uint256" },
    { name: "valueBps", type: "uint16" },
    { name: "fixedAmount", type: "uint256" },
    { name: "visitsGoal", type: "uint32" },
    { name: "active", type: "bool" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** EIP-2612 permit of USDr, signed together with each PaymentIntent. */
export const usdrPermitDomain = (verifyingContract: Address, chainId: number = monadTestnet.id) =>
  ({ name: "RewApp Dollar", version: "1", chainId, verifyingContract }) as const;

export const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const RuleType = { CASHBACK: 0, VISIT_BONUS: 1 } as const;
export const Audience = { CUSTOMER: 0, COMMERCE: 1 } as const;

export type PaymentIntent = {
  payer: Address;
  merchant: Address;
  amount: bigint;
  chargeId: Hex;
  nonce: bigint;
  deadline: bigint;
};

export type RedeemIntent = {
  account: Address;
  rewardId: bigint;
  nonce: bigint;
  deadline: bigint;
};

export type RuleIntent = {
  merchant: Address;
  ruleType: (typeof RuleType)[keyof typeof RuleType];
  minAmount: bigint;
  valueBps: number;
  fixedAmount: bigint;
  visitsGoal: number;
  active: boolean;
  nonce: bigint;
  deadline: bigint;
};
