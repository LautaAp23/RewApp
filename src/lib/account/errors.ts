import { isMeraError } from "@category-labs/mera";

type AccountErrorCode = "WRONG_ACCOUNT" | "BACKUP_VAULT_REQUEST_FAILED";

class AccountError extends Error {
  readonly code: AccountErrorCode;

  constructor(code: AccountErrorCode, message: string) {
    super(message);
    this.name = "AccountError";
    this.code = code;
  }
}

/** Key under `errors` in messages/<locale>.json. */
type AccountErrorKey =
  | "generic"
  | "wrongAccount"
  | "network"
  | "passkeyFailed"
  | "prfUnavailable"
  | "browserUnsupported"
  | "backupFailed"
  | "sessionEnded";

// Users never see raw Mera or WebAuthn errors (docs/PLAN.md §3, principle 7).
function humanAccountError(error: unknown): AccountErrorKey {
  if (error instanceof AccountError) {
    switch (error.code) {
      case "WRONG_ACCOUNT":
        return "wrongAccount";
      case "BACKUP_VAULT_REQUEST_FAILED":
        return "network";
    }
  }
  if (isMeraError(error)) {
    switch (error.code) {
      case "PASSKEY_OPERATION_FAILED":
        return "passkeyFailed";
      case "PRF_UNAVAILABLE":
        return "prfUnavailable";
      case "CRYPTO_UNAVAILABLE":
        return "browserUnsupported";
      case "DECRYPT_FAILED":
      case "VAULT_FORMAT_INVALID":
        return "backupFailed";
      case "SESSION_ENDED":
        return "sessionEnded";
      default:
        return "generic";
    }
  }
  if (error instanceof TypeError) {
    return "network";
  }
  return "generic";
}

export { AccountError, humanAccountError };
export type { AccountErrorCode, AccountErrorKey };
