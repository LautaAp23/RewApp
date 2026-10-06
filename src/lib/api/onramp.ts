import type { Address, Hash } from "viem";
import type { Currency } from "../money";

/** Simulated top-up caps (USDr base units) and rate limits per hour. */
export const ONRAMP_MAX_USD = 200_000_000n;
export const ONRAMP_PER_ADDRESS_PER_HOUR = 5;
export const ONRAMP_PER_IP_PER_HOUR = 10;

export type OnrampRequest = { address: Address; localAmount: string; currency: Currency };
export type OnrampResponse = { txHash: Hash; usdAmount: string };
