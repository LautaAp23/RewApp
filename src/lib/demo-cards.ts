import type { SavedCard } from "./payment-methods";

/** Fictional display fixtures only: never card numbers, CVVs or bank tokens. */
export const DEMO_CARDS = [
  { demoId: "visa-debit", brand: "Visa", last4: "4242", funding: "debit" },
  { demoId: "mastercard-credit", brand: "Mastercard", last4: "4444", funding: "credit" },
  { demoId: "visa-prepaid", brand: "Visa", last4: "5556", funding: "prepaid" },
] as const satisfies readonly (Omit<SavedCard, "id"> & { demoId: string })[];

export function findDemoCard(id: unknown) {
  return DEMO_CARDS.find((card) => card.demoId === id);
}

export function cardReturnPath(next: string | null) {
  return next && /^\/pagar\/[a-zA-Z0-9_-]+$/.test(next) ? next : "/inicio#tarjetas";
}
