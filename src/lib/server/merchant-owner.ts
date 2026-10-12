import "server-only";
import { getAddress, isAddress, isHex, type Hex } from "viem";
import { merchantOwnershipTypes } from "@/lib/api/typed-data";
import { verifySignedRequest } from "@/lib/api/signed-request";
import { isDerivationIndex } from "@/lib/merchant-index";

type OwnershipCheck = "ok" | "expired_signature" | "invalid_signature" | "invalid_request";

function ownershipMessage(owner: string, merchant: string, derivationIndex: number, deadline: bigint) {
  return { owner: getAddress(owner), merchant: getAddress(merchant), derivationIndex: BigInt(derivationIndex), deadline };
}

/** Confirms `signature` was produced by `signer` over the ownership message. */
async function verifyOwnershipSignature(params: {
  signer: string;
  owner: string;
  merchant: string;
  derivationIndex: number;
  deadline: bigint;
  signature: unknown;
}): Promise<OwnershipCheck> {
  if (
    !isAddress(params.signer) ||
    !isAddress(params.owner) ||
    !isAddress(params.merchant) ||
    !isDerivationIndex(params.derivationIndex) ||
    !isHex(params.signature)
  ) {
    return "invalid_request";
  }
  return verifySignedRequest({
    signer: getAddress(params.signer),
    types: merchantOwnershipTypes,
    primaryType: "MerchantOwnership",
    message: ownershipMessage(params.owner, params.merchant, params.derivationIndex, params.deadline),
    deadline: params.deadline,
    signature: params.signature as Hex,
    fresh: true,
  });
}

export { verifyOwnershipSignature };
export type { OwnershipCheck };
