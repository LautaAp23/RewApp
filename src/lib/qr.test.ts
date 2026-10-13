import { describe, expect, it } from "vitest";
import { chargeFromQr } from "./qr";

describe("chargeFromQr", () => {
  const origin = "https://rewapp.vercel.app";
  it("reads the charge from a RewApp payment URL", () => {
    expect(chargeFromQr("https://rewapp.vercel.app/pagar/cm1abc2def", origin)).toBe("cm1abc2def");
    expect(chargeFromQr("https://preview-x.vercel.app/pagar/cm1abc2def/", origin)).toBe("cm1abc2def");
    expect(chargeFromQr("/pagar/cm1abc2def", origin)).toBe("cm1abc2def");
  });
  it("ignores other QR codes", () => {
    expect(chargeFromQr("https://example.com/menu", origin)).toBeNull();
    expect(chargeFromQr("https://rewapp.vercel.app/pagar/../admin", origin)).toBeNull();
    expect(chargeFromQr("WIFI:S:cafe;T:WPA;P:1234;;", origin)).toBeNull();
  });
  it("reads personal collection QRs through the same scanner as merchant QRs", () => {
    const id = "p2p_12345678-1234-1234-1234-123456789abc";
    expect(chargeFromQr(`/pagar/${id}`, origin)).toBe(id);
    expect(chargeFromQr(`https://preview.vercel.app/pagar/${id}`, origin)).toBe(id);
  });
});
