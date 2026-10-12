import { getAddress, isAddress, isHex } from "viem";
import { verifySignedRequest } from "./signed-request";
import { addCardTypes, listCardsTypes } from "./typed-data";
import type { CardMetadata } from "../card-metadata";

export async function checkCardRequest(body: Record<string, unknown>, card?: CardMetadata) {
  const { accountAddress, deadline, signature } = body;
  if (typeof accountAddress !== "string" || !isAddress(accountAddress) ||
      typeof deadline !== "string" || !/^\d{1,12}$/.test(deadline) ||
      typeof signature !== "string" || !isHex(signature) || signature.length !== 132) return null;
  const account = getAddress(accountAddress);
  const expiry = BigInt(deadline);
  const result = await verifySignedRequest({
    signer: account, types: card ? addCardTypes : listCardsTypes,
    primaryType: card ? "AddCard" : "ListCards",
    message: card ? { account, ...card, expiryMonth: BigInt(card.expiryMonth), expiryYear: BigInt(card.expiryYear), deadline: expiry } : { account, deadline: expiry },
    deadline: expiry, signature, fresh: true,
  });
  return result === "ok" ? account : null;
}
