import { describe, expect, it, vi } from "vitest";
import { RELAY_ATTEMPTS, sendWithNonceRetries } from "./relay-queue";

const nonceError = new Error("nonce too low");
const isNonceError = (error: unknown) => /nonce/i.test(String(error));
const noSleep = async () => undefined;

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
