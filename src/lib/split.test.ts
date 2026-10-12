import { describe, expect, it } from "vitest";
import { divideExactly, normalizeParticipants } from "./split";
import { accountCode, decodeAccountCode } from "./account-code";
const a = "0x1111111111111111111111111111111111111111",
  b = "0x2222222222222222222222222222222222222222";
describe("shared bill allocation", () => {
  it("conserves every cent and base unit, including remainders", () => {
    for (let count = 2; count <= 12; count++)
      for (const total of [13n, 100n, 100001n, 12345678901234567890n]) {
        const parts = divideExactly(total, count);
        expect(parts.reduce((a, b) => a + b, 0n)).toBe(total);
        expect(parts.every((p) => p > 0n)).toBe(true);
        expect(parts[0] - parts[parts.length - 1]).toBeLessThanOrEqual(1n);
      }
  });
  it.each([0, 1, 13, 2.5])(
    "rejects unsupported participant count %s",
    (count) => {
      expect(() => divideExactly(100n, count)).toThrow();
    },
  );
  it("rejects sub-unit shares", () =>
    expect(() => divideExactly(1n, 2)).toThrow());
  it("requires the organizer, distinct accounts and valid identifiers", () => {
    expect(normalizeParticipants([a, b], a)).toEqual([a, b]);
    expect(() => normalizeParticipants([b, b], a)).toThrow();
    expect(() => normalizeParticipants([a, a], a)).toThrow();
    expect(() => normalizeParticipants([a, "bad"], a)).toThrow();
  });
  it("roundtrips user-facing account codes and rejects malformed codes", () => {
    expect(decodeAccountCode(accountCode(a))).toBe(a);
    expect(decodeAccountCode(accountCode(b))).toBe(b);
    expect(decodeAccountCode(a)).toBeNull();
    expect(decodeAccountCode("RW-unknown")).toBeNull();
  });
});
