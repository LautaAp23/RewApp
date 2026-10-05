"use client";

import { useEffect, useState } from "react";
import type { FxRates } from "./money";

let cached: Promise<FxRates> | undefined;

function loadFxRates(): Promise<FxRates> {
  cached ??= fetch("/api/fx")
    .then((response) => {
      if (!response.ok) throw new Error(`fx ${response.status}`);
      return response.json() as Promise<{ rates: FxRates }>;
    })
    .then(({ rates }) => rates)
    .catch((error: unknown) => {
      cached = undefined;
      throw error;
    });
  return cached;
}

/** Simulated FX rates from /api/fx; empty until loaded (amounts fall back to USD). */
function useFxRates(): FxRates {
  const [rates, setRates] = useState<FxRates>({});
  useEffect(() => {
    let active = true;
    loadFxRates()
      .then((loaded) => active && setRates(loaded))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return rates;
}

export { loadFxRates, useFxRates };
