import { clearInvite, readInvite } from "./referral-storage";

type SignedClaim = { account: string; code: string; deadline: string; signature: `0x${string}` };

/** Fired on window once a claim went through, so screens showing "who invited you" can refresh. */
export const INVITE_CLAIMED_EVENT = "rewapp:invite-claimed";

/** Answers after which retrying can never succeed. Anything else (paused, rate limit, 5xx, offline) retries. */
const FINAL = new Set(["referral_closed", "already_referred", "own_code", "referral_code_not_found"]);

/** Sends the saved invite for the signed-in account. Never throws on HTTP answers. */
export async function claimSavedInvite(
  sign: (code: string) => Promise<SignedClaim>,
): Promise<"none" | "claimed" | "dropped" | "kept"> {
  const invite = readInvite();
  if (!invite) return "none";
  try {
    const signed = await sign(invite.code);
    const response = await fetch("/api/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signed),
    });
    if (response.status === 202) {
      clearInvite();
      try {
        window.dispatchEvent(new Event(INVITE_CLAIMED_EVENT));
      } catch {}
      return "claimed";
    }
    const { error } = (await response.json().catch(() => ({}))) as { error?: string };
    if (error && FINAL.has(error)) {
      clearInvite();
      return "dropped";
    }
    return "kept";
  } catch {
    return "kept";
  }
}

/**
 * Once per account per page load. Signing out is client-side, so a second account created in the same
 * load (sign out → "Crear cuenta" with a code) must still get its claim.
 */
export function claimGuard() {
  let claimedFor: string | undefined;
  return (status: string, address: string | undefined) => {
    if (status !== "signed-in" || !address || claimedFor === address) return false;
    claimedFor = address;
    return true;
  };
}
