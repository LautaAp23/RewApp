import { BaseError } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNonceMemo,
  isNonceError as realIsNonceError,
  RELAY_ATTEMPTS,
  relayErrorText,
  sendWithNonceRetries,
} from "./relay-queue";

const nonceError = new Error("nonce too low");
const isNonceError = (error: unknown) => /nonce/i.test(String(error));
const noSleep = async () => undefined;

let errors: unknown[][];

beforeEach(() => {
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...args) => {
    errors.push(args);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendWithNonceRetries", () => {
  it("devuelve el resultado y el nonce usado cuando sale a la primera", async () => {
    const send = vi.fn(async (nonce: number) => `tx-${nonce}`);
    const result = await sendWithNonceRetries({
      getNonce: async () => 7, send, isNonceError, sleep: noSleep,
    });
    expect(result).toEqual({ result: "tx-7", usedNonce: 7 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("relee el nonce y reintenta cuando otra instancia se adelantó", async () => {
    const nonces = [5, 6];
    const getNonce = vi.fn(async () => nonces.shift() ?? 0);
    const send = vi.fn(async (nonce: number) => {
      if (nonce === 5) throw nonceError;
      return `tx-${nonce}`;
    });
    const result = await sendWithNonceRetries({ getNonce, send, isNonceError, sleep: noSleep });
    expect(result.result).toBe("tx-6");
    expect(getNonce).toHaveBeenCalledTimes(2);
  });

  it("aguanta tres choques seguidos antes de rendirse", async () => {
    let calls = 0;
    const send = vi.fn(async (nonce: number) => {
      calls += 1;
      if (calls < RELAY_ATTEMPTS) throw nonceError;
      return `tx-${nonce}`;
    });
    const result = await sendWithNonceRetries({
      getNonce: async () => 1, send, isNonceError, sleep: noSleep,
    });
    expect(result.result).toBe("tx-1");
    expect(send).toHaveBeenCalledTimes(RELAY_ATTEMPTS);
  });

  it("tira el error cuando se agotan los intentos", async () => {
    const send = vi.fn(async () => { throw nonceError; });
    await expect(sendWithNonceRetries({
      getNonce: async () => 1, send, isNonceError, sleep: noSleep,
    })).rejects.toThrow("nonce too low");
    expect(send).toHaveBeenCalledTimes(RELAY_ATTEMPTS);
  });

  it("no reintenta un error que no es de nonce", async () => {
    const send = vi.fn(async () => { throw new Error("insufficient funds"); });
    await expect(sendWithNonceRetries({
      getNonce: async () => 1, send, isNonceError, sleep: noSleep,
    })).rejects.toThrow("insufficient funds");
    expect(send).toHaveBeenCalledTimes(1);
  });

  // Review Focus 5: el filtro es un regex sobre el texto. Un error ajeno que
  // mencione "nonce" se reintenta igual. Queda fijado para que sea decisión.
  it("reintenta cualquier error cuyo texto mencione nonce", async () => {
    const send = vi.fn(async () => { throw new Error("invalid nonce manager config"); });
    await expect(sendWithNonceRetries({
      getNonce: async () => 1, send, isNonceError, sleep: noSleep,
    })).rejects.toThrow("invalid nonce manager");
    expect(send).toHaveBeenCalledTimes(RELAY_ATTEMPTS);
  });

  it("espera cada vez más entre intentos", async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
    };
    const send = vi.fn(async () => { throw nonceError; });
    await expect(sendWithNonceRetries({
      getNonce: async () => 1, send, isNonceError, sleep,
    })).rejects.toThrow();
    expect(waits).toEqual([25, 50, 75]);
  });
});

describe("isNonceError", () => {
  const cases: [string, boolean][] = [
    ["nonce too low", true],
    ["nonce too high", true],
    // viem ya mapea este mensaje a NonceTooLowError, cuyo shortMessage dice
    // "Nonce", pero el predicado no debería depender de ese mapeo.
    ["already known", true],
    // Hallazgo 3 de la revisión: esto es lo que devuelve un nodo de la familia
    // Geth cuando dos instancias eligen el mismo nonce, que es exactamente el
    // choque que estos reintentos vienen a cubrir.
    ["replacement transaction underpriced", true],
    ["insufficient funds for gas * price + value", false],
    ["execution reverted", false],
  ];

  for (const [message, expected] of cases) {
    it(`${expected ? "reintenta" : "no reintenta"}: ${message}`, () => {
      expect(realIsNonceError(new Error(message))).toBe(expected);
    });
  }

  it("mira el shortMessage y los details de un error de viem, no solo el texto", () => {
    expect(realIsNonceError(new BaseError("Nonce provided for the transaction is too low."))).toBe(true);
    expect(relayErrorText(new BaseError("short", { details: "replacement transaction underpriced" })))
      .toContain("replacement transaction underpriced");
  });

  it("registra el texto crudo del primer intento fallido, para saber qué dice Monad", async () => {
    const send = vi.fn(async () => {
      throw new Error("replacement transaction underpriced");
    });
    await expect(sendWithNonceRetries({
      getNonce: async () => 1, send, isNonceError: realIsNonceError, sleep: noSleep,
    })).rejects.toThrow();
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain("replacement transaction underpriced");
    expect(String(errors[0])).toContain("retriable=true");
  });
});

describe("createNonceMemo", () => {
  function memoWith(chainNonces: number[]) {
    const readChainNonce = vi.fn(async () => chainNonces.shift() ?? -1);
    return { memo: createNonceMemo({ readChainNonce }), readChainNonce };
  }

  it("dos envíos consecutivos usan nonces seguidos con una sola lectura de cadena", async () => {
    const { memo, readChainNonce } = memoWith([10]);
    const used: number[] = [];
    for (let i = 0; i < 2; i++) {
      const { usedNonce } = await sendWithNonceRetries({
        getNonce: memo.getNonce,
        send: async (nonce: number) => nonce,
        isNonceError: realIsNonceError,
        sleep: noSleep,
      });
      memo.commit(usedNonce);
      used.push(usedNonce);
    }
    expect(used).toEqual([10, 11]);
    expect(readChainNonce).toHaveBeenCalledTimes(1);
  });

  it("un choque de nonce relee de la cadena", async () => {
    const { memo, readChainNonce } = memoWith([10, 12]);
    const { usedNonce } = await sendWithNonceRetries({
      getNonce: memo.getNonce,
      send: async (nonce: number) => {
        if (nonce === 10) throw new Error("nonce too low");
        return nonce;
      },
      isNonceError: realIsNonceError,
      sleep: noSleep,
    });
    memo.commit(usedNonce);
    expect(usedNonce).toBe(12);
    expect(readChainNonce).toHaveBeenCalledTimes(2);
  });

  it("deja el memo sucio cuando los intentos se agotan, así el relay siguiente relee", async () => {
    const { memo, readChainNonce } = memoWith([10, 11, 12, 13, 20]);
    await expect(sendWithNonceRetries({
      getNonce: memo.getNonce,
      send: async () => { throw new Error("nonce too low"); },
      isNonceError: realIsNonceError,
      sleep: noSleep,
    })).rejects.toThrow();
    expect(await memo.getNonce()).toBe(20);
    expect(readChainNonce).toHaveBeenCalledTimes(RELAY_ATTEMPTS + 1);
  });

  it("deja el memo sucio ante un error ajeno", async () => {
    const { memo, readChainNonce } = memoWith([10, 20]);
    await expect(sendWithNonceRetries({
      getNonce: memo.getNonce,
      send: async () => { throw new Error("execution reverted"); },
      isNonceError: realIsNonceError,
      sleep: noSleep,
    })).rejects.toThrow("execution reverted");
    expect(await memo.getNonce()).toBe(20);
    expect(readChainNonce).toHaveBeenCalledTimes(2);
  });
});
