import { keccak256, stringToHex, type Address, type Hex } from "viem";

export * from "./abis";
export * from "./eip712";

/** USDr has 6 decimals. */
export const USDR_DECIMALS = 6;

export const contractAddresses = {
  usdr: process.env.NEXT_PUBLIC_USDR_ADDRESS as Address | undefined,
  rewAppPay: process.env.NEXT_PUBLIC_REWAPP_PAY_ADDRESS as Address | undefined,
};

export function requireContractAddresses(): { usdr: Address; rewAppPay: Address } {
  const { usdr, rewAppPay } = contractAddresses;
  if (!usdr || !rewAppPay) {
    throw new Error("NEXT_PUBLIC_USDR_ADDRESS and NEXT_PUBLIC_REWAPP_PAY_ADDRESS must be set");
  }
  return { usdr, rewAppPay };
}

/** Onchain id of a Charge: keccak256 of its Postgres id. */
export function chargeIdToBytes32(chargeId: string): Hex {
  return keccak256(stringToHex(chargeId));
}
