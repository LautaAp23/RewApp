import { describe, expect, it } from "vitest";
import { normalizeHandle } from "./user-handle";
describe("unique account handles", () => {
  it("canonicalizes case, whitespace and the optional @", () => {
    expect(normalizeHandle(" @Santi.Samson ")).toBe("santi.samson");
    expect(normalizeHandle("SANTI_SAMSON")).toBe("santi_samson");
  });
  it("rejects ambiguous, malformed or oversized identifiers", () => {
    for (const value of ["ab", "a".repeat(25), "@", "@@santi", "santi samson", "-santi", "santi.", "RW-account", "sánti", null, {}]) expect(normalizeHandle(value)).toBeNull();
  });
});
