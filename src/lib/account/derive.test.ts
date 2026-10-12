import { describe, expect, it } from "vitest";
import { accountFromEntropy, addressFromEntropy } from "./derive";

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

const MERCHANT_ADDRESS = "0x85DB1c10e736fd49e8A3C4e96C59b1Fa77E82e30";

describe("identidad de comercio", () => {
  it("el mismo origen da una dirección de comercio distinta y estable", () => {
    expect(addressFromEntropy(KNOWN_ENTROPY.slice(), "merchant")).toBe(MERCHANT_ADDRESS);
    expect(addressFromEntropy(KNOWN_ENTROPY.slice(), "merchant")).not.toBe(PERSON_ADDRESS);
  });

  it("el default sigue siendo la persona, así que nada existente se mueve", () => {
    expect(addressFromEntropy(KNOWN_ENTROPY.slice(), "person")).toBe(PERSON_ADDRESS);
    const account = accountFromEntropy(KNOWN_ENTROPY.slice());
    try {
      expect(account.address).toBe(PERSON_ADDRESS);
    } finally {
      account.session.end();
    }
  });

  it("el segundo comercio sale de otra dirección, y el primero no se mueve", () => {
    const first = addressFromEntropy(KNOWN_ENTROPY.slice(), "merchant", 0);
    const second = addressFromEntropy(KNOWN_ENTROPY.slice(), "merchant", 1);
    expect(first).toBe(MERCHANT_ADDRESS);
    expect(second).not.toBe(first);
    expect(second).not.toBe(PERSON_ADDRESS);
  });

  it("no deja la entropía en memoria después de leer la dirección", () => {
    const entropy = KNOWN_ENTROPY.slice();
    addressFromEntropy(entropy, "merchant");
    expect(entropy.every((byte) => byte === 0)).toBe(true);
  });
});
