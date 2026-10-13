import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import es from "../../messages/es.json";
import en from "../../messages/en.json";
import pt from "../../messages/pt.json";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { ChargeStatusSection } from "./charge-status-section";

const messages = { es, en, pt } as const;
const locales = ["es", "en", "pt"] as const;
const payerAddress = "0x3333333333333333333333333333333333333333";
const issued = {
  id: "charge-1",
  localAmount: "3500.00",
  expiresAt: "2030-01-01T00:00:00Z",
  qrDataUrl: "data:image/png;base64,QR",
};

function render(
  locale: (typeof locales)[number],
  props: Partial<Parameters<typeof ChargeStatusSection>[0]>,
) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="UTC">
      <ChargeStatusSection
        issued={issued}
        status="PAID"
        payerName={null}
        confirmedAt={new Date("2030-02-03T12:34:00Z")}
        registerName="Caja 1"
        amountText="$ 3.500,00"
        locale={locale}
        onAnother={() => undefined}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("till charge states in every locale", () => {
  for (const locale of locales) {
    const business = messages[locale].business;
    it(`${locale}: confirmed charge shows amount, payer, time and register`, () => {
      const html = render(locale, { payerName: "Ana" });
      expect(html).toContain(business.paidTitle);
      expect(html).toContain("$ 3.500,00");
      expect(html).toContain("Ana");
      expect(html).toContain(business.confirmedAt.split("{time}")[0].trim());
      expect(html).toContain("Caja 1");
      expect(html).not.toContain(payerAddress);
    });
    it(`${locale}: confirmed charge without a name shows the generic label, never the address`, () => {
      const html = render(locale, { payerName: null });
      expect(html).toContain(business.paidTitle);
      expect(html).toContain(business.paidByGuest);
      expect(html).not.toContain("0x");
    });
    it(`${locale}: expired charge offers another charge`, () => {
      const html = render(locale, { status: "EXPIRED" });
      expect(html).toContain(business.expiredTitle);
      expect(html).toContain(business.expiredHint);
      expect(html).toContain(business.anotherCharge);
      expect(html).not.toContain("0x");
    });
    it(`${locale}: processing keeps the QR and shows the confirming state`, () => {
      const html = render(locale, { status: "PROCESSING" });
      expect(html).toContain(business.confirming);
      expect(html).toContain("data:image/png;base64,QR");
    });
    it(`${locale}: pending shows the QR while waiting`, () => {
      const html = render(locale, { status: "PENDING" });
      expect(html).toContain(business.waiting);
      expect(html).toContain("data:image/png;base64,QR");
      expect(html).not.toContain("0x");
    });
  }
});
