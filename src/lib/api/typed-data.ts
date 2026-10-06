import { monadTestnet } from "viem/chains";

/**
 * Off-chain RewApp API requests signed by the account (not RewAppPay intents).
 * They are signed after a fresh passkey prompt, never by the session policy.
 */
export const rewAppApiDomain = (chainId: number = monadTestnet.id) =>
  ({ name: "RewApp", version: "1", chainId }) as const;

export const profileUpdateTypes = {
  ProfileUpdate: [
    { name: "account", type: "address" },
    { name: "alias", type: "string" },
    { name: "country", type: "string" },
    { name: "currency", type: "string" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** Signed API requests are valid for at most this long. */
export const API_SIGNATURE_TTL_SECONDS = 10 * 60;

export function isFreshDeadline(deadline: bigint, nowMs = Date.now()) {
  const now = BigInt(Math.floor(nowMs / 1000));
  return deadline > now && deadline <= now + BigInt(API_SIGNATURE_TTL_SECONDS);
}
