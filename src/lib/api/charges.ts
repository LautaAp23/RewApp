import type { Address, Hex } from "viem";
import type { Currency } from "../money";

/** A charge can be paid during this window after it is created. */
export const CHARGE_TTL_MS = 15 * 60 * 1000;

export type ChargeStatus = "PENDING" | "PAID" | "EXPIRED";

/** POST /api/charges body (signed by the merchant as CreateCharge). */
export type CreateChargeRequest = {
  merchant: Address;
  localAmount: string;
  currency: Currency;
  deadline: string;
  signature: Hex;
};

/** GET /api/charges/[id]?payer=0x…&currency=ARS. Amounts in USDr base units as strings. */
export type ChargeView = {
  id: string;
  /** keccak256 of `id`: the PaymentIntent chargeId. */
  chargeId: Hex;
  status: ChargeStatus;
  expiresAt: string;
  merchant: {
    name: string;
    logoUrl: string | null;
    category: string;
    address: Address;
  };
  localAmount: string;
  localCurrency: Currency;
  usdAmount: string;
  /** Amount in the payer's currency, when requested and a rate exists. */
  payerAmount: { amount: number; currency: Currency } | null;
  /** What the payment would earn now; null without `payer` or if the chain is unreachable. */
  reward: { merchantReward: string; customerPoints: string } | null;
  txHash: string | null;
};
