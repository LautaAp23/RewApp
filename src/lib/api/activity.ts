import type { Address } from "viem";
import type { Currency } from "../money";

type ActivityMerchant = {
  name: string;
  logoUrl: string | null;
  address: Address;
  visits: number;
  /** VISIT_BONUS goal ("every N visits"), null without an active rule. */
  visitsGoal: number | null;
};

type ActivityPayment = {
  id: string;
  merchant: { name: string; logoUrl: string | null };
  usdAmount: string;
  localAmount: string;
  localCurrency: Currency;
  txHash: string | null;
  createdAt: string;
};

type ActivityTopUp = {
  id: string;
  usdAmount: string;
  txHash: string | null;
  createdAt: string;
};

/** GET /api/activity/[address]. USDr amounts in base units; null if the chain did not answer. */
type Activity = {
  balance: string | null;
  points: string | null;
  merchants: ActivityMerchant[];
  payments: ActivityPayment[];
  topUps: ActivityTopUp[];
};

export type { Activity, ActivityMerchant, ActivityPayment, ActivityTopUp };
