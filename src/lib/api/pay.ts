import type { Address, Hash, Hex } from "viem";

/** JSON wire format: every uint256 travels as a decimal string. */
export type PayRequest = {
  /** Charge id (Postgres); `intent.chargeId` must be its keccak256. */
  charge: string;
  intent: {
    payer: Address;
    merchant: Address;
    amount: string;
    chargeId: Hex;
    nonce: string;
    deadline: string;
  };
  signature: Hex;
  permit: { value: string; deadline: string; v: number; r: Hex; s: Hex };
};

export type PayResponse = {
  txHash: Hash;
  merchantReward: string;
  customerPoints: string;
};

export type RedeemRequest = {
  intent: { account: Address; rewardId: string; nonce: string; deadline: string };
  signature: Hex;
};

export type RedeemResponse = { txHash: Hash };

/** Error codes returned with HTTP 4xx by /api/pay and /api/redeem. */
export type RelayErrorCode =
  | "invalid_request"
  | "invalid_signature"
  | "charge_mismatch"
  | "not_found"
  | "already_paid"
  | "expired"
  | "over_limit"
  | "insufficient_funds"
  | "reward_unavailable"
  | "insufficient_points"
  | "rejected";
