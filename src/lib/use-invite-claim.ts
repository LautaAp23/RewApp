"use client";
import { useEffect } from "react";
import { useAccount } from "./account/account-context";
import { claimGuard, claimSavedInvite } from "./claim-invite";

// Sign-up lands on /inicio right after creating the account; a later load retries an invite that was
// kept (paused program, rate limit, network). Keyed by account, see claimGuard.
const shouldClaim = claimGuard();

export function useInviteClaim() {
  const { status, address, signClaimReferral } = useAccount();
  useEffect(() => {
    if (!shouldClaim(status, address)) return;
    void claimSavedInvite(signClaimReferral);
  }, [status, address, signClaimReferral]);
}
