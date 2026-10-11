import { describe, expect, it } from "vitest";
import { accountFromEntropy } from "./derive";

// Direcciones verificadas el 11 oct 2026 contra @scure/bip32 + bip39 y contra
// getEvmAddress de Mera, que coinciden exactamente. Si alguno de estos valores
// cambia, cambiaron TODAS las cuentas y se perdió el acceso de todo el mundo.
const KNOWN_ENTROPY = new Uint8Array(32).fill(1);
const PERSON_ADDRESS = "0x37566338ADFbf56aa41FE8FC38aA92dB1e12aD59";

describe("derivación de la cuenta", () => {
  it("una entropía conocida da siempre la misma dirección de persona", () => {
    const account = accountFromEntropy(KNOWN_ENTROPY.slice());
    try {
      expect(account.address).toBe(PERSON_ADDRESS);
    } finally {
      account.session.end();
    }
  });

  it("es determinista entre llamadas", () => {
    const first = accountFromEntropy(KNOWN_ENTROPY.slice());
    const second = accountFromEntropy(KNOWN_ENTROPY.slice());
    try {
      expect(first.address).toBe(second.address);
    } finally {
      first.session.end();
      second.session.end();
    }
  });

  it("entropías distintas dan cuentas distintas", () => {
    const other = Uint8Array.from({ length: 32 }, (_, i) => i);
    const a = accountFromEntropy(KNOWN_ENTROPY.slice());
    const b = accountFromEntropy(other);
    try {
      expect(a.address).not.toBe(b.address);
    } finally {
      a.session.end();
      b.session.end();
    }
  });
});
