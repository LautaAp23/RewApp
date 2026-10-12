import { monadTestnet } from "viem/chains";

export const addDemoCardTypes = {
  AddDemoCard: [
    { name: "account", type: "address" },
    { name: "demoId", type: "string" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

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
    { name: "email", type: "string" },
    { name: "country", type: "string" },
    { name: "currency", type: "string" },
    { name: "birthDay", type: "string" },
    { name: "birthMonth", type: "string" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** Signed API requests are valid for at most this long. */
export const API_SIGNATURE_TTL_SECONDS = 10 * 60;

export function isFreshDeadline(deadline: bigint, nowMs = Date.now()) {
  const now = BigInt(Math.floor(nowMs / 1000));
  return deadline > now && deadline <= now + BigInt(API_SIGNATURE_TTL_SECONDS);
}

/** The merchant signs its own profile for our API; lat/lng travel as strings
 * so the signature covers them too. */
export const merchantProfileTypes = {
  MerchantProfile: [
    { name: "merchant", type: "address" },
    { name: "name", type: "string" },
    { name: "category", type: "string" },
    { name: "city", type: "string" },
    { name: "streetAddress", type: "string" },
    { name: "country", type: "string" },
    { name: "currency", type: "string" },
    { name: "email", type: "string" },
    { name: "placeId", type: "string" },
    { name: "lat", type: "string" },
    { name: "lng", type: "string" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** The ten profile fields the merchant signs. Every one travels as a string so
 * the signature covers them verbatim, coordinates included. */
export type MerchantProfileFields = {
  name: string;
  category: string;
  city: string;
  streetAddress: string;
  country: string;
  currency: string;
  email: string;
  placeId: string;
  lat: string;
  lng: string;
};

/** The person signs this so a business is tied to their profile, not to whoever
 * holds a merchant key. derivationIndex picks which key of that passkey it is. */
export const merchantOwnershipTypes = {
  MerchantOwnership: [
    { name: "owner", type: "address" },
    { name: "merchant", type: "address" },
    { name: "derivationIndex", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** Mirrors RewAppPay.MERCHANT_INTENT_TYPEHASH. Verified against the RewAppPay
 * domain, not the API one, because the contract checks this same signature. */
export const merchantIntentTypes = {
  MerchantIntent: [
    { name: "merchant", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** The merchant panel signs each new charge (docs/PLAN.md §4.3). */
export const createChargeTypes = {
  CreateCharge: [
    { name: "merchant", type: "address" },
    { name: "localAmount", type: "string" },
    { name: "currency", type: "string" },
    { name: "deadline", type: "uint256" },
  ],
} as const;
