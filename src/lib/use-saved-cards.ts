"use client";

import { useEffect, useState } from "react";
import type { SavedCard } from "./payment-methods";
import { useAccount } from "./account/account-context";

export function useSavedCards(address: string | undefined, enabled = true) {
  const { signListCards, status } = useAccount();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ address?: string; cards: SavedCard[]; failed: boolean; loaded: boolean }>({ cards: [], failed: false, loaded: false });
  useEffect(() => {
    if (!enabled || !address) return;
    const controller = new AbortController();
    setState({ address, cards: [], failed: false, loaded: false });
    void signListCards().then((proof) => {
      if (proof.accountAddress.toLowerCase() !== address.toLowerCase()) throw new Error("session changed");
      return fetch("/api/cards/list", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(proof), cache: "no-store", signal: controller.signal });
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("load failed");
        const data = await response.json();
        if (!controller.signal.aborted) setState({ address, cards: data.cards, failed: false, loaded: true });
      }).catch(() => {
        if (!controller.signal.aborted) setState({ address, cards: [], failed: true, loaded: true });
      });
    return () => controller.abort();
  }, [address, enabled, attempt, signListCards, status]);
  const current = state.address === address;
  return { cards: current ? state.cards : [], failed: current && state.failed, loading: Boolean(enabled && address && (!current || !state.loaded)), reload: () => setAttempt((value) => value + 1) };
}
