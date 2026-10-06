"use client";

import { useEffect, useState } from "react";
import { type Currency, currencyForLanguageTag, isCurrency } from "./money";

/**
 * Saved profile currency, or the one of the browser region until a profile exists.
 * Client-only: the (cliente) layout renders nothing until the account is ready.
 */
function useCurrency(address: string | undefined): Currency {
  const [currency, setCurrency] = useState<Currency>(() =>
    typeof navigator === "undefined" ? "USD" : currencyForLanguageTag(navigator.language),
  );

  useEffect(() => {
    if (!address) return;
    let active = true;
    fetch(`/api/profile/${address}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((profile: { country: string | null; currency: string } | null) => {
        if (active && profile?.country && isCurrency(profile.currency)) {
          setCurrency(profile.currency);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [address]);

  return currency;
}

export { useCurrency };
