import type { AccountErrorKey } from "./errors";

/**
 * Errores de compatibilidad donde crear una cuenta falla igual que ingresar:
 * la única salida real es usar otro dispositivo.
 */
const COMPATIBILITY_ERRORS: ReadonlySet<AccountErrorKey> = new Set([
  "prfUnavailable",
  "browserUnsupported",
]);

/**
 * Whether a failed sign-in should also offer creating a new account next to
 * retrying and using another device. Never offered without an error.
 */
export function shouldOfferCreateNew(
  error: AccountErrorKey | undefined,
): boolean {
  return error !== undefined && !COMPATIBILITY_ERRORS.has(error);
}
