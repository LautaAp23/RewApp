import { type Address, type Hex, type TypedDataDomain, verifyTypedData } from "viem";
import { isFreshDeadline, rewAppApiDomain } from "./typed-data";

type VerifyResult = "ok" | "expired_signature" | "invalid_signature";

/**
 * Verifies an EIP-712 request of the RewApp API domain.
 *
 * `fresh` is required on purpose. Pass `true` when nothing else enforces the
 * deadline (every off-chain write: profile, demo cards, charges, merchants).
 * Pass `false` only when a contract checks `intent.deadline` itself, as
 * `payWithSig` and `redeemWithSig` do. Making it explicit is what keeps a new
 * route from forgetting the check.
 */
async function verifySignedRequest(params: {
  signer: Address;
  types: Record<string, readonly { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
  deadline: bigint;
  signature: Hex;
  fresh: boolean;
  chainId?: number;
  domain?: TypedDataDomain;
}): Promise<VerifyResult> {
  if (params.fresh && !isFreshDeadline(params.deadline)) return "expired_signature";
  const domain =
    params.domain ?? rewAppApiDomain(params.chainId ?? Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143));
  // One cast on the whole argument, not per field: viem infers `types` and
  // `primaryType` together, so widening them one by one collapses the overload
  // and makes the entire parameter `never`.
  const valid = await verifyTypedData({
    address: params.signer,
    domain,
    types: params.types,
    primaryType: params.primaryType,
    message: params.message,
    signature: params.signature,
  } as Parameters<typeof verifyTypedData>[0]).catch(() => false);
  return valid ? "ok" : "invalid_signature";
}

export { verifySignedRequest };
export type { VerifyResult };
