"use client";

import { useEffect, useState } from "react";
import type { SavedCard } from "./payment-methods";

export function useSavedCards(address: string | undefined, enabled = true) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ address?: string; cards: SavedCard[]; failed: boolean; loaded: boolean }>({ cards: [], failed: false, loaded: false });
  useEffect(() => {
    if (!enabled || !address) return;
    const controller = new AbortController();
    setState({ address, cards: [], failed: false, loaded: false });
    void fetch(`/api/demo-cards?account=${encodeURIComponent(address)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("load failed");
        const data = await response.json();
        if (!controller.signal.aborted) setState({ address, cards: data.cards, failed: false, loaded: true });
      }).catch(() => {
        if (!controller.signal.aborted) setState({ address, cards: [], failed: true, loaded: true });
      });
    return () => controller.abort();
  }, [address, enabled, attempt]);
  const current = state.address === address;
  return { cards: current ? state.cards : [], failed: current && state.failed, loading: Boolean(enabled && address && (!current || !state.loaded)), reload: () => setAttempt((value) => value + 1) };
}
