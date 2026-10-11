import { DEMO_CARDS } from "./demo-cards";

// Browser-only test input fixtures; the API receives only the matching demoId.
export const DEMO_CARD_NUMBERS = ["4242424242424242", "5555555555554444", "4000056655665556"] as const;

export const cardDigits = (value: string) => value.replace(/\D/g, "");
export const formatCardNumber = (value: string) => cardDigits(value).slice(0, 19).replace(/(.{4})(?=.)/g, "$1 ");
export function formatCardExpiry(value: string) {
  const digits = cardDigits(value).slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}
export function demoCardFromNumber(value: string) {
  const index = DEMO_CARD_NUMBERS.findIndex((number) => number === cardDigits(value));
  return index < 0 ? undefined : DEMO_CARDS[index];
}

export type CardFormValues = { number: string; holder: string; expiry: string; securityCode: string };
export type CardFormErrors = Partial<Record<keyof CardFormValues, "numberError" | "holderError" | "expiryError" | "securityCodeError">>;

export function validateCardForm(values: CardFormValues, now = new Date()): CardFormErrors {
  const errors: CardFormErrors = {};
  if (!demoCardFromNumber(values.number)) errors.number = "numberError";
  if (values.holder.trim().length < 2 || values.holder.trim().length > 80) errors.holder = "holderError";
  const digits = cardDigits(values.expiry);
  const month = Number(digits.slice(0, 2));
  const year = 2000 + Number(digits.slice(2));
  if (!/^\d{2}\/\d{2}$/.test(values.expiry) || month < 1 || month > 12 ||
      year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) errors.expiry = "expiryError";
  if (!/^\d{3}$/.test(values.securityCode)) errors.securityCode = "securityCodeError";
  return errors;
}
