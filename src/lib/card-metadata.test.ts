import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { checkCardRequest } from "./api/card-request";
import { addCardTypes, listCardsTypes, rewAppApiDomain } from "./api/typed-data";
import { validCardMetadata, validCardExpiry, validCardExpiryInput } from "./card-metadata";

const card = { brand: "Visa", last4: "1234", holder: "Alex Smith", expiryMonth: 12, expiryYear: 2030 };
const signer = privateKeyToAccount(`0x${"11".repeat(32)}`);
const other = privateKeyToAccount(`0x${"22".repeat(32)}`);
const now = new Date(Date.UTC(2026, 9, 12));

describe("card metadata and owner authorization", () => {
  it("accepts metadata and rejects full numbers, invalid dates and malformed types", () => {
    expect(validCardMetadata(card, now)).toBe(true);
    for (const patch of [{ last4: "4242424242424242" }, { last4: 1234 }, { expiryMonth: 13 }, { expiryYear: 2025 }, { expiryYear: 2200 }, { holder: " " }, { brand: "invalid" }]) {
      expect(validCardMetadata({ ...card, ...patch } as typeof card, now)).toBe(false);
    }
    expect(validCardMetadata({ ...card, expiryMonth: 10, expiryYear: 2026 }, now)).toBe(false);
    expect(validCardMetadata({ ...card, expiryMonth: 9, expiryYear: 2026 }, now)).toBe(false);
  });

  it("requires a future month, valid MM/YY and a plausible horizon", () => {
    for (const expiry of ["", "1/27", "01/2", "00/27", "13/27", "10/26", "09/26", "12/25", "11/46", "12/99", "aa/bb", "01/2027"]) {
      expect(validCardExpiryInput(expiry, now), expiry).toBe(false);
    }
    for (const expiry of ["11/26", "01/27", "10/46"]) expect(validCardExpiryInput(expiry, now), expiry).toBe(true);
    const december = new Date(Date.UTC(2026, 11, 31, 23, 59));
    expect(validCardExpiryInput("12/26", december)).toBe(false);
    expect(validCardExpiryInput("01/27", december)).toBe(true);
    expect(validCardExpiry(1.5, 2027, now)).toBe(false);
    expect(validCardExpiry(1, NaN, now)).toBe(false);
    expect(validCardExpiry(1, 2027.5, now)).toBe(false);
  });

  it("binds registration to its owner, metadata and expiration", async () => {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
    const signature = await signer.signTypedData({ domain: rewAppApiDomain(), types: addCardTypes, primaryType: "AddCard",
      message: { account: signer.address, ...card, expiryMonth: BigInt(card.expiryMonth), expiryYear: BigInt(card.expiryYear), deadline } });
    const body = { accountAddress: signer.address, deadline: deadline.toString(), signature };
    expect(await checkCardRequest(body, card)).toBe(signer.address);
    expect(await checkCardRequest({ ...body, accountAddress: other.address }, card)).toBeNull();
    expect(await checkCardRequest(body, { ...card, last4: "9999" })).toBeNull();
    expect(await checkCardRequest({ ...body, deadline: "1" }, card)).toBeNull();
    expect(await checkCardRequest(body)).toBeNull();
  });

  it("requires an owner signature to list cards", async () => {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60);
    const signature = await signer.signTypedData({ domain: rewAppApiDomain(), types: listCardsTypes, primaryType: "ListCards", message: { account: signer.address, deadline } });
    const body = { accountAddress: signer.address, deadline: deadline.toString(), signature };
    expect(await checkCardRequest(body)).toBe(signer.address);
    expect(await checkCardRequest({ ...body, accountAddress: other.address })).toBeNull();
    expect(await checkCardRequest({ ...body, signature: "no" })).toBeNull();
  });
});
