import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import es from "../../messages/es.json";
import en from "../../messages/en.json";
import pt from "../../messages/pt.json";
import { shouldOfferCreateNew } from "@/lib/account/login-options";
import type { AccountErrorKey } from "@/lib/account/errors";

const pushMock = vi.fn();
const replaceMock = vi.fn();
let searchParamsValue = new URLSearchParams();
let accountValue: {
  status: string;
  error: AccountErrorKey | undefined;
  signIn: () => void;
  clearError: () => void;
} = {
  status: "signed-out",
  error: undefined,
  signIn: () => undefined,
  clearError: () => undefined,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, refresh: vi.fn() }),
  useSearchParams: () => searchParamsValue,
}));
vi.mock("@/i18n/actions", () => ({ setLocale: vi.fn() }));
vi.mock("@/lib/account/account-context", () => ({
  useAccount: () => accountValue,
}));

import Home from "./page";
import RegisterPage from "./registro/page";

const messages = { es, en, pt } as const;
const locales = ["es", "en", "pt"] as const;

// renderToStaticMarkup escapes apostrophes, so expected texts go through this.
function htmlEscaped(text: string) {
  return text.replaceAll("'", "&#x27;");
}

function renderHome(locale: (typeof locales)[number]) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="UTC">
      <Home />
    </NextIntlClientProvider>,
  );
}

function renderRegister(locale: (typeof locales)[number]) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="UTC">
      <RegisterPage />
    </NextIntlClientProvider>,
  );
}

describe("shouldOfferCreateNew", () => {
  it("offers creating an account for recoverable errors", () => {
    const recoverable: AccountErrorKey[] = [
      "generic",
      "wrongAccount",
      "network",
      "passkeyFailed",
      "backupFailed",
      "sessionEnded",
    ];
    for (const error of recoverable) expect(shouldOfferCreateNew(error)).toBe(true);
  });
  it("hides it for compatibility errors and without an error", () => {
    expect(shouldOfferCreateNew("prfUnavailable")).toBe(false);
    expect(shouldOfferCreateNew("browserUnsupported")).toBe(false);
    expect(shouldOfferCreateNew(undefined)).toBe(false);
  });
});

describe("login error card in every locale", () => {
  for (const locale of locales) {
    const landing = messages[locale].landing;
    it(`${locale}: recoverable failure shows retry, another device and create new`, () => {
      accountValue = { ...accountValue, status: "signed-out", error: "passkeyFailed" };
      const html = renderHome(locale);
      expect(html).toContain(landing.retry);
      expect(html).toContain(landing.otherDevice);
      expect(html).toContain(htmlEscaped(landing.createNewFromError));
      expect(html).toContain(htmlEscaped(landing.createNewFromErrorHint));
    });
    it(`${locale}: incompatible manager shows only retry and another device`, () => {
      accountValue = { ...accountValue, status: "signed-out", error: "prfUnavailable" };
      const html = renderHome(locale);
      expect(html).toContain(landing.retry);
      expect(html).toContain(landing.otherDevice);
      expect(html).not.toContain(htmlEscaped(landing.createNewFromError));
      expect(html).not.toContain(htmlEscaped(landing.createNewFromErrorHint));
    });
    it(`${locale}: unsupported browser shows only retry and another device`, () => {
      accountValue = { ...accountValue, status: "signed-out", error: "browserUnsupported" };
      const html = renderHome(locale);
      expect(html).toContain(landing.retry);
      expect(html).toContain(landing.otherDevice);
      expect(html).not.toContain(htmlEscaped(landing.createNewFromError));
    });
  }
});

describe("register duplicate warning in every locale", () => {
  for (const locale of locales) {
    const register = messages[locale].register;
    it(`${locale}: reinforces the warning when coming from a failed sign-in`, () => {
      searchParamsValue = new URLSearchParams("from=login");
      accountValue = { ...accountValue, status: "signed-out", error: undefined };
      const html = renderRegister(locale);
      expect(html).toContain(htmlEscaped(register.fromLoginWarning));
      expect(html).toContain(register.alreadyHaveAccount);
    });
    it(`${locale}: direct arrival keeps the standard notice only`, () => {
      searchParamsValue = new URLSearchParams();
      accountValue = { ...accountValue, status: "signed-out", error: undefined };
      const html = renderRegister(locale);
      expect(html).toContain(register.alreadyHaveAccount);
      expect(html).not.toContain(htmlEscaped(register.fromLoginWarning));
    });
  }
});
