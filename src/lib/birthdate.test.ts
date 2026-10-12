import { describe, expect, it } from "vitest";
import { isPossibleDate, mergeBirthdate, parseBirthdateFields } from "./birthdate";

describe("isPossibleDate", () => {
  it("accepts normal dates and Feb 29", () => {
    expect(isPossibleDate(15, 5)).toBe(true);
    expect(isPossibleDate(29, 2)).toBe(true);
    expect(isPossibleDate(31, 1)).toBe(true);
  });
  it("rejects impossible combinations and out-of-range values", () => {
    expect(isPossibleDate(30, 2)).toBe(false);
    expect(isPossibleDate(31, 4)).toBe(false);
    expect(isPossibleDate(0, 5)).toBe(false);
    expect(isPossibleDate(15, 13)).toBe(false);
    expect(isPossibleDate(32, 1)).toBe(false);
  });
});

describe("parseBirthdateFields", () => {
  it("treats missing or empty as not provided", () => {
    expect(parseBirthdateFields(undefined, undefined)).toBeNull();
    expect(parseBirthdateFields("", "")).toBeNull();
  });
  it("parses a valid pair", () => {
    expect(parseBirthdateFields("7", "3")).toEqual({ day: 7, month: 3 });
  });
  it("rejects half pairs, garbage and impossible dates", () => {
    expect(parseBirthdateFields("7", "")).toBe("invalid");
    expect(parseBirthdateFields("", "3")).toBe("invalid");
    expect(parseBirthdateFields("ab", "3")).toBe("invalid");
    expect(parseBirthdateFields("30", "2")).toBe("invalid");
    expect(parseBirthdateFields(7, 3)).toBe("invalid");
  });
});

describe("mergeBirthdate", () => {
  it("stores the first valid value", () => {
    expect(mergeBirthdate(null, "7", "3")).toEqual({ ok: true, day: 7, month: 3 });
  });
  it("keeps the stored value when nothing is sent", () => {
    expect(mergeBirthdate({ birthDay: 7, birthMonth: 3 }, "", "")).toEqual({
      ok: true,
      day: 7,
      month: 3,
    });
  });
  it("allows resending the same values", () => {
    expect(mergeBirthdate({ birthDay: 7, birthMonth: 3 }, "7", "3")).toEqual({
      ok: true,
      day: 7,
      month: 3,
    });
  });
  it("locks any change once set", () => {
    expect(mergeBirthdate({ birthDay: 7, birthMonth: 3 }, "8", "3")).toEqual({
      ok: false,
      error: "locked",
    });
  });
  it("rejects invalid input", () => {
    expect(mergeBirthdate(null, "30", "2")).toEqual({ ok: false, error: "invalid" });
  });
});
