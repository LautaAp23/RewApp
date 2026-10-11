import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { verifyTypedData } from "viem";
import { cardReturnPath, DEMO_CARDS, findDemoCard } from "./demo-cards";
import { addDemoCardTypes, isFreshDeadline, rewAppApiDomain } from "./api/typed-data";

describe("demo card boundaries", () => {
  it("only accepts known fictional fixtures", () => {
    expect(findDemoCard("visa-debit")).toBe(DEMO_CARDS[0]);
    for (const value of [null, {}, "4242424242424242", "__proto__", "Visa"]) expect(findDemoCard(value)).toBeUndefined();
  });

  it("only returns to a charge or the card selector", () => {
    expect(cardReturnPath("/pagar/demo-charge_123")).toBe("/pagar/demo-charge_123");
    for (const value of [null, "/inicio", "//evil.test", "/\\evil.test", "https://evil.test", "/pagar/x?next=//evil.test", "/pagar/../admin", "/pagar/%2f"]) {
      expect(cardReturnPath(value)).toBe("/inicio#tarjetas");
    }
  });

  it("binds the signature to the account, fixture and expiry", async () => {
    const signer = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const other = privateKeyToAccount(`0x${"22".repeat(32)}`);
    const message = { account: signer.address, demoId: "visa-debit", deadline: 2000n };
    const data = { domain: rewAppApiDomain(), types: addDemoCardTypes, primaryType: "AddDemoCard" as const, message };
    const signature = await signer.signTypedData(data);
    expect(await verifyTypedData({ ...data, address: signer.address, signature })).toBe(true);
    expect(await verifyTypedData({ ...data, message: { ...message, demoId: "mastercard-credit" }, address: signer.address, signature })).toBe(false);
    expect(await verifyTypedData({ ...data, message: { ...message, account: other.address }, address: other.address, signature })).toBe(false);
    expect(await verifyTypedData({ ...data, message: { ...message, deadline: 2001n }, address: signer.address, signature })).toBe(false);
    expect(isFreshDeadline(2000n, 2000000)).toBe(false);
    expect(isFreshDeadline(2601n, 2000000)).toBe(false);
    expect(isFreshDeadline(2300n, 2000000)).toBe(true);
  });
});
