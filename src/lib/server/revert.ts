import "server-only";
import { BaseError, ContractFunctionRevertedError, toFunctionSelector } from "viem";
import type { RelayErrorCode } from "@/lib/api/pay";

const REVERT_CODES: Record<string, RelayErrorCode> = {
  ChargeAlreadyUsed: "already_paid",
  Expired: "expired",
  InvalidSignature: "invalid_signature",
  InvalidAccountNonce: "invalid_signature",
  PaymentLimitExceeded: "over_limit",
  DailyLimitExceeded: "over_limit",
  ERC20InsufficientBalance: "insufficient_funds",
  ERC20InsufficientAllowance: "insufficient_funds",
  RewardUnavailable: "reward_unavailable",
  WrongAudience: "reward_unavailable",
  InsufficientPoints: "insufficient_points",
};

// USDr errors bubble up through RewAppPay but are not in its ABI, so match them by selector.
const SELECTOR_CODES: Record<string, RelayErrorCode> = {
  [toFunctionSelector("ERC20InsufficientBalance(address,uint256,uint256)")]: "insufficient_funds",
  [toFunctionSelector("ERC20InsufficientAllowance(address,uint256,uint256)")]: "insufficient_funds",
};

/** Maps a simulateContract revert to an API error code; undefined if it was not a revert. */
export function revertCode(error: unknown): RelayErrorCode | undefined {
  if (!(error instanceof BaseError)) return undefined;
  const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
  if (!(revert instanceof ContractFunctionRevertedError)) return undefined;
  const byName = REVERT_CODES[revert.data?.errorName ?? ""];
  const bySelector = revert.signature ? SELECTOR_CODES[revert.signature] : undefined;
  return byName ?? bySelector ?? "rejected";
}
