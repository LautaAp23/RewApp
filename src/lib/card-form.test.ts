import { describe, expect, it } from "vitest";
import { cardDigits, DEMO_CARD_NUMBERS, demoCardFromNumber, formatCardExpiry, formatCardNumber, validateCardForm } from "./card-form";

const now = new Date(2026, 9, 10);
const valid = { number: DEMO_CARD_NUMBERS[0], holder: "Alex Test", expiry: "10/26", securityCode: "123" };

describe("test card entry", () => {
  it("formats pasted numbers and expiry without losing digits", () => {
    expect(formatCardNumber("4242-4242 4242 4242")).toBe("4242 4242 4242 4242");
    expect(cardDigits(formatCardNumber(DEMO_CARD_NUMBERS[1]))).toBe(DEMO_CARD_NUMBERS[1]);
    expect(formatCardExpiry("1228")).toBe("12/28");
    expect(formatCardExpiry("1")).toBe("1");
  });
  it("maps only allowed test numbers to demo fixtures", () => {
    expect(DEMO_CARD_NUMBERS.map((number) => demoCardFromNumber(number)?.demoId)).toEqual(["visa-debit", "mastercard-credit", "visa-prepaid"]);
    expect(demoCardFromNumber("4111111111111111")).toBeUndefined();
    expect(validateCardForm({ ...valid, number: "4111111111111111" }, now).number).toBe("numberError");
  });
  it("requires all fields and rejects expired or malformed expiry and codes", () => {
    expect(validateCardForm(valid, now)).toEqual({});
    for (const expiry of ["09/26", "12/25", "00/28", "13/28", "1/28", "12/", "ab/cd"]) expect(validateCardForm({ ...valid, expiry }, now).expiry).toBe("expiryError");
    expect(validateCardForm({ ...valid, expiry: "11/26" }, now)).toEqual({});
    for (const securityCode of ["", "12", "1234", "abc"]) expect(validateCardForm({ ...valid, securityCode }, now).securityCode).toBe("securityCodeError");
    expect(validateCardForm({ ...valid, holder: "  " }, now).holder).toBe("holderError");
  });
});
