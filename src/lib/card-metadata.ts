/** Identifying metadata only. Provider tokens must come from a trusted provider API. */
export const CARD_BRANDS = ["Visa", "Mastercard", "American Express", "Other"] as const;
export type CardMetadata = {
  brand: string;
  last4: string;
  holder: string;
  expiryMonth: number;
  expiryYear: number;
};

/** Month/year precision: require a later month, at most 20 years ahead. UTC on both sides. */
export function validCardExpiry(month: number, year: number, now = new Date()) {
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) return false;
  const monthsAhead = (year - now.getUTCFullYear()) * 12 + month - (now.getUTCMonth() + 1);
  return monthsAhead > 0 && monthsAhead <= 20 * 12;
}

export function validCardExpiryInput(expiry: string, now = new Date()) {
  return /^\d{2}\/\d{2}$/.test(expiry) &&
    validCardExpiry(Number(expiry.slice(0, 2)), 2000 + Number(expiry.slice(3)), now);
}

export function validCardMetadata(value: CardMetadata, now = new Date()) {
  return typeof value.brand === "string" && CARD_BRANDS.includes(value.brand as typeof CARD_BRANDS[number]) &&
    typeof value.last4 === "string" && /^\d{4}$/.test(value.last4) && typeof value.holder === "string" &&
    value.holder === value.holder.trim() && value.holder.length >= 2 && value.holder.length <= 80 &&
    validCardExpiry(value.expiryMonth, value.expiryYear, now);
}
