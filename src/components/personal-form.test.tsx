import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import es from "../../messages/es.json";
import en from "../../messages/en.json";
import pt from "../../messages/pt.json";
const owner = "0x1111111111111111111111111111111111111111";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/account/account-context", () => ({ useAccount: () => ({ address: "0x1111111111111111111111111111111111111111" }) }));
vi.mock("@/lib/use-currency", () => ({ useCurrency: () => "USD" }));
vi.mock("./fx-note", () => ({ FxNote: () => null }));
vi.mock("@/lib/use-workspace", () => ({ useWorkspace: () => ({ busy: false, run: vi.fn(), data: {
  contacts: [{ id: "ana", address: "0x2222222222222222222222222222222222222222", label: "Ana Demo" }], personalCharges: [
    { id: "previous-paid", recipient: "0x1111111111111111111111111111111111111111", kind: "REQUEST", status: "PAID", note: "OLDER_CONFIRMED_REQUEST", localCurrency: "USD", localAmount: "10.00", expiresAt: "2099-01-01T00:00:00Z" },
    { id: "current-request", recipient: "0x1111111111111111111111111111111111111111", recipientName: "MY_OWN_NAME", expectedPayer: "0x2222222222222222222222222222222222222222", kind: "REQUEST", status: "PENDING", note: "CURRENT_PENDING_REQUEST", localCurrency: "USD", localAmount: "2.00", expiresAt: "2099-01-01T00:00:00Z" },
  ], account: "0x1111111111111111111111111111111111111111",
} }) }));
import { PersonalForm } from "./personal-form";
describe("new payment forms do not show previous receipts", () => {
  for (const locale of ["es", "en", "pt"] as const) {
    const messages = { es, en, pt }[locale];
    it.each(["DIRECT", "REQUEST"] as const)(`${locale}: %s starts without the previous payment`, mode => {
      const html = renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><PersonalForm mode={mode} /></NextIntlClientProvider>);
      expect(html).not.toContain("/comprobante/");
      expect(html).not.toContain("OLDER_CONFIRMED_REQUEST");
      expect(html).not.toContain("USD 10.00");
      if (mode === "REQUEST") {
        expect(html).toContain("CURRENT_PENDING_REQUEST");
        expect(html).toMatch(/href="\/pagar\/p2p_current-request"[^]*?Ana Demo/);
        expect(html).not.toContain("MY_OWN_NAME");
      }
      else expect(html).not.toContain("CURRENT_PENDING_REQUEST");
      expect(html).not.toContain(owner);
    });
  }
});
