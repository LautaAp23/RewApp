import { describe, expect, it } from "vitest";
import { makeReferralCode, normalizeReferralCode, REFERRAL_ALPHABET } from "./referral-code";

const first = () => 0;

describe("makeReferralCode", () => {
  it("starts with the alias in plain lowercase and ends with 4 random characters", () => {
    expect(makeReferralCode("Ana López", first)).toBe("analopez-2222");
  });
  it("keeps at most 10 characters of the alias", () => {
    expect(makeReferralCode("Maximiliano Fernández", first)).toBe("maximilian-2222");
  });
  it("uses 6 random characters without a usable alias", () => {
    expect(makeReferralCode(null, first)).toBe("222222");
    expect(makeReferralCode("李雷 🎉", first)).toBe("222222");
  });
  it("only produces codes that normalize to themselves", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = makeReferralCode(i % 2 ? "Beto" : null, (max) => Math.floor(Math.random() * max));
      expect(normalizeReferralCode(code)).toBe(code);
    }
  });
});

describe("normalizeReferralCode", () => {
  it("accepts typed codes with spaces and uppercase", () => {
    expect(normalizeReferralCode(" ANA-7K2Q ")).toBe("ana-7k2q");
  });
  it.each(["ana-7k2o", "ana-7k21", "ana-ik2q", "ana-7k2", "0x1111111111111111111111111111111111111111", "", "a b-7k2q"])(
    "rejects %s",
    (value) => expect(normalizeReferralCode(value)).toBeNull(),
  );
  it("rejects non-strings", () => {
    expect(normalizeReferralCode(123)).toBeNull();
    expect(normalizeReferralCode(undefined)).toBeNull();
  });
  it("never uses ambiguous characters", () => {
    expect(REFERRAL_ALPHABET).not.toMatch(/[01ilo]/);
  });
});
