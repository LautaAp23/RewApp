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

const GENERIC_MESSAGE = "Algo salió mal. Probá de nuevo.";

// Users never see raw Mera or WebAuthn errors (docs/PLAN.md §3, principle 7).
function humanAccountError(error: unknown): string {
  if (error instanceof AccountError) {
    switch (error.code) {
      case "WRONG_ACCOUNT":
        return "Esa passkey es de otra cuenta. Elegí la passkey de esta cuenta.";
      case "BACKUP_VAULT_REQUEST_FAILED":
        return "No pudimos conectarnos con RewApp. Revisá tu conexión y probá de nuevo.";
    }
  }
  if (isMeraError(error)) {
    switch (error.code) {
      case "PASSKEY_OPERATION_FAILED":
        return "No pudimos leer tu passkey. Probá de nuevo o usá otro dispositivo.";
      case "PRF_UNAVAILABLE":
        return "Este gestor de passkeys no es compatible con RewApp. Probá con el de Google o Apple, o con otro dispositivo.";
      case "CRYPTO_UNAVAILABLE":
        return "Tu navegador no es compatible con RewApp. Actualizalo o probá con otro.";
      case "DECRYPT_FAILED":
      case "VAULT_FORMAT_INVALID":
        return "No pudimos abrir tu passkey de respaldo. Probá con tu passkey principal.";
      case "SESSION_ENDED":
        return "Tu sesión terminó. Ingresá de nuevo con tu passkey.";
      default:
        return GENERIC_MESSAGE;
    }
  }
  if (error instanceof TypeError) {
    return "No pudimos conectarnos con RewApp. Revisá tu conexión y probá de nuevo.";
  }
  return GENERIC_MESSAGE;
}

export { AccountError, humanAccountError };
export type { AccountErrorCode };
