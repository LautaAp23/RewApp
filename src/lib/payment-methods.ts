/** Display metadata from a future card provider. Never pass PANs or security codes. */
export type SavedCard = {
  isDemo?: boolean;
  id: string;
  brand: string;
  last4: string;
  funding: "debit" | "credit" | "prepaid" | "unknown";
};

export type PaymentMethod =
  | { type: "balance" }
  | { type: "card"; card: SavedCard };
