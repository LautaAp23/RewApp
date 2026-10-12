"use client";

import type { EvmAddress } from "@category-labs/mera";

type RoleName = "person" | "merchant";

type MerchantSummary = {
  address: string;
  name: string;
  category?: string;
  city?: string | null;
  currency?: string;
};
type Roles = { hasProfile: boolean; merchant: MerchantSummary | null };

const ACTIVE_ROLE_KEY = "rewapp:active-role";

/**
 * Which identities of this passkey already exist. One request for both
 * addresses, so the gateway decides without a second round trip. A failure is
 * never fatal: signing in has to work even when this answer is missing.
 */
async function fetchRoles(addresses: { person: EvmAddress; merchant: EvmAddress }): Promise<Roles> {
  try {
    const query = `person=${addresses.person}&merchant=${addresses.merchant}`;
    const response = await fetch(`/api/account?${query}`, { cache: "no-store" });
    if (!response.ok) return { hasProfile: false, merchant: null };
    const data = (await response.json()) as { profile: unknown; merchant: MerchantSummary | null };
    return { hasProfile: Boolean(data.profile), merchant: data.merchant ?? null };
  } catch {
    return { hasProfile: false, merchant: null };
  }
}

/** Per-browser convenience only; never a source of truth. */
function rememberRole(role: RoleName) {
  try {
    localStorage.setItem(ACTIVE_ROLE_KEY, role);
  } catch {
    // Private windows and blocked site data: the app works without this.
  }
}

function readRememberedRole(): RoleName {
  try {
    return localStorage.getItem(ACTIVE_ROLE_KEY) === "merchant" ? "merchant" : "person";
  } catch {
    return "person";
  }
}

export { fetchRoles, readRememberedRole, rememberRole };
export type { MerchantSummary, RoleName, Roles };
