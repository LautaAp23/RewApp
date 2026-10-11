"use client";

import Link from "next/link";
import { useId } from "react";
import { useTranslations } from "next-intl";
import { BottomSheet } from "./bottom-sheet";
import { PaymentMethodIcon } from "./payment-method-icon";
import { primaryButton, secondaryButton } from "./ui";
import type { PaymentMethod, SavedCard } from "@/lib/payment-methods";
import { useAccount } from "@/lib/account/account-context";
import { useSavedCards } from "@/lib/use-saved-cards";

const EMPTY_CARDS: readonly SavedCard[] = [];
const row = "flex min-h-20 w-full items-center gap-4 rounded-card border p-4 text-left";
const interactive = "hover:bg-elevated/40 active:bg-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

type CardSelectorProps = {
  open: boolean;
  onClose(): void;
  /** Optional metadata override; otherwise loads this account's demo cards. */
  cards?: readonly SavedCard[];
  addCardHref?: string;
  /** Omit to show cards from the profile menu without making a payment. */
  payment?: {
    merchant: string;
    amount: string;
    selected: PaymentMethod | null;
    onSelect(method: PaymentMethod): void;
  };
};

function SelectionMark({ selected }: { selected: boolean }) {
  return (
    <span className={`ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-on-primary" : "border-muted"}`} aria-hidden>
      {selected ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12 4 4L19 6" />
        </svg>
      ) : null}
    </span>
  );
}

/** Controlled overlay: selecting a method never authorizes or submits a payment. */
export function CardSelector({
  open,
  onClose,
  cards: providedCards,
  addCardHref = "/tarjetas/nueva",
  payment,
}: CardSelectorProps) {
  const t = useTranslations("cardSelector");
  const cardsTitleId = useId();
  const account = useAccount();
  const saved = useSavedCards(account.address, open && providedCards === undefined);
  const cards = providedCards ?? saved.cards ?? EMPTY_CARDS;

  function select(method: PaymentMethod) {
    payment?.onSelect(method);
    onClose();
  }

  return (
    <BottomSheet open={open} title={t(payment ? "payTitle" : "title")} description={t(payment ? "payDescription" : "description")} onClose={onClose}>
      <div className="flex min-h-0 flex-col gap-6 overflow-y-auto overscroll-contain px-6 pb-6">
        {payment ? (
          <>
            <div className="flex items-center justify-between gap-4 rounded-card bg-background px-4 py-3">
              <span className="min-w-0 truncate text-sm text-muted">{payment.merchant}</span>
              <span className="shrink-0 font-medium">{payment.amount}</span>
            </div>
            <button
              type="button"
              className={`${row} ${interactive} ${payment.selected?.type === "balance" ? "border-primary bg-primary/5" : "border-elevated bg-background"}`}
              aria-pressed={payment.selected?.type === "balance"}
              onClick={() => select({ type: "balance" })}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-primary/10 text-primary">
                <PaymentMethodIcon type="balance" />
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{t("balance")}</span>
                <span className="mt-1 block text-sm text-muted">{t("balanceHint")}</span>
              </span>
              <SelectionMark selected={payment.selected?.type === "balance"} />
            </button>
          </>
        ) : null}

        <section aria-labelledby={cardsTitleId} className="flex flex-col gap-3">
          {payment ? <h3 id={cardsTitleId} className="text-lg font-medium">{t("cards")}</h3> : <h3 id={cardsTitleId} className="sr-only">{t("cards")}</h3>}
          {providedCards === undefined && saved.loading ? <p role="status" className="text-sm text-muted">{t("loading")}</p> : providedCards === undefined && saved.failed ? (
            <div role="alert" className="flex flex-col gap-3">
              <p className="text-sm text-error">{t("loadError")}</p>
              <button className={secondaryButton} onClick={saved.reload}>{t("retry")}</button>
            </div>
          ) : cards.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {cards.map((card) => {
                const selected = payment?.selected?.type === "card" && payment.selected.card.id === card.id;
                const details = (
                  <>
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-elevated text-muted">
                      <PaymentMethodIcon />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{card.brand} <span className="ml-1 whitespace-nowrap tabular-nums">{t("maskedNumber", { last4: card.last4 })}</span></span>
                      <span className="mt-1 block text-sm text-muted">{t(`funding.${card.funding}`)}{card.isDemo ? ` · ${t("demo")}` : ""}</span>
                    </span>
                    {payment ? <SelectionMark selected={Boolean(selected)} /> : null}
                  </>
                );
                return (
                  <li key={card.id}>
                    {payment ? (
                      <button
                        type="button"
                        className={`${row} ${interactive} ${selected ? "border-primary bg-primary/5" : "border-elevated bg-background"}`}
                        aria-label={t("cardLabel", { brand: card.brand, last4: card.last4, funding: t(`funding.${card.funding}`) })}
                        aria-pressed={Boolean(selected)}
                        onClick={() => select({ type: "card", card })}
                      >
                        {details}
                      </button>
                    ) : (
                      <div className={`${row} border-elevated bg-background`}>{details}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-elevated px-4 py-6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-card bg-elevated text-muted"><PaymentMethodIcon /></span>
              <div className="flex flex-col gap-1">
                <p className="font-medium">{t("emptyTitle")}</p>
                <p className="text-sm text-muted">{t("emptyDescription")}</p>
              </div>
            </div>
          )}
        </section>
      </div>

      <footer className="shrink-0 border-t border-elevated px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Link href={addCardHref} prefetch={false} onClick={onClose} className={`${payment ? secondaryButton : primaryButton} gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}>
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          {t("addCard")}
        </Link>
      </footer>
    </BottomSheet>
  );
}
