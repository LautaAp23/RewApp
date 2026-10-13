"use client";
import { useEffect } from "react";
import { useAccount } from "./account/account-context";
import { claimSavedInvite } from "./claim-invite";

// Once per page load: sign-up lands on /inicio right after creating the account, and any later
// load retries an invite that was kept (paused program, rate limit, network).
let attempted = false;

export function useInviteClaim() {
  const { status, signClaimReferral } = useAccount();
  useEffect(() => {
    if (attempted || status !== "signed-in") return;
    attempted = true;
    void claimSavedInvite(signClaimReferral);
  }, [status, signClaimReferral]);
}
