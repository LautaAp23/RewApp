import { describe, expect, it } from "vitest";
import {
  currencyForCountry,
  formatUsdr,
  isCurrency,
  localToUsdr,
  parseDecimal,
  usdrToLocal,
} from "./money";

const rates = { ARS: "1523.0868", EUR: "0.88889", BRL: "5.222532", CLP: "987.993764" };

describe("money", () => {
  it("parses local amounts with up to 2 decimals", () => {
    expect(parseDecimal("1234.5", 2)).toBe(123450n);
    expect(parseDecimal("7", 2)).toBe(700n);
    expect(() => parseDecimal("1.234", 2)).toThrow();
    expect(() => parseDecimal("-1", 2)).toThrow();
    expect(() => parseDecimal("1e3", 2)).toThrow();
  });

  it("converts local amounts to USDr and back", () => {
    expect(localToUsdr("10", "1")).toBe(10_000_000n);
    expect(localToUsdr("15230.87", rates.ARS)).toBe(10_000_001n);
    expect(usdrToLocal(10_000_000n, rates.ARS)).toBe(15230.87);
  });

  it("shows the same payment coherently in ARS and EUR (T8)", () => {
    const usdr = localToUsdr("15230.87", rates.ARS);
    expect(usdrToLocal(usdr, rates.EUR)).toBe(8.89);
    expect(formatUsdr(usdr, "EUR", rates, "es-AR")).toMatch(/8,89/);
    expect(formatUsdr(usdr, "ARS", rates, "es-AR")).toMatch(/15\.230,87/);
  });

  it("formats CLP without decimals and falls back to USD without a rate", () => {
    expect(formatUsdr(10_000_000n, "CLP", rates, "es-CL")).toMatch(/9\.880/);
    expect(formatUsdr(10_000_000n, "MXN", rates, "en-US")).toBe("$10.00");
  });

  it("maps countries to currencies", () => {
    expect(currencyForCountry("ar")).toBe("ARS");
    expect(currencyForCountry("ES")).toBe("EUR");
    expect(currencyForCountry(undefined)).toBe("USD");
    expect(isCurrency("BRL")).toBe(true);
    expect(isCurrency("XYZ")).toBe(false);
  });
});
