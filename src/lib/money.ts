/** Currencies with a simulated FX rate (FxRate table). USDr is pegged 1:1 to USD. */
const CURRENCIES = ["ARS", "USD", "EUR", "BRL", "MXN", "CLP"] as const;
type Currency = (typeof CURRENCIES)[number];

/** Units of each currency per 1 USD, as decimal strings (FxRate.usdRate). */
type FxRates = Partial<Record<Currency, string>>;

const USDR_UNIT = 1_000_000n;
const RATE_DECIMALS = 6;
const LOCAL_DECIMALS = 2;

const COUNTRY_CURRENCY: Record<string, Currency> = {
  AR: "ARS",
  BR: "BRL",
  CL: "CLP",
  MX: "MXN",
  US: "USD",
  ES: "EUR",
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  PT: "EUR",
  NL: "EUR",
  IE: "EUR",
};

function isCurrency(value: unknown): value is Currency {
  return CURRENCIES.includes(value as Currency);
}

function currencyForCountry(country: string | null | undefined): Currency {
  return COUNTRY_CURRENCY[country?.toUpperCase() ?? ""] ?? "USD";
}

/** Region of a BCP 47 tag ("es-AR" → ARS); USD when the tag has no region. */
function currencyForLanguageTag(tag: string): Currency {
  try {
    return currencyForCountry(new Intl.Locale(tag).region);
  } catch {
    return "USD";
  }
}

/** Decimals the currency is shown with (CLP: 0, ARS/EUR/…: 2). */
function currencyDigits(currency: Currency, locale: string): number {
  return (
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

/** "1234.5" → 123450n with 2 decimals. Throws on negatives, junk or extra decimals. */
function parseDecimal(value: string, decimals: number): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match || (match[2]?.length ?? 0) > decimals) {
    throw new RangeError(`invalid decimal: ${value}`);
  }
  const fraction = (match[2] ?? "").padEnd(decimals, "0");
  return BigInt(match[1] + fraction);
}

function divRound(numerator: bigint, denominator: bigint) {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/** Local amount (up to 2 decimals) → USDr base units (6 decimals). */
function localToUsdr(localAmount: string, usdRate: string): bigint {
  const cents = parseDecimal(localAmount, LOCAL_DECIMALS);
  const rate = parseDecimal(usdRate, RATE_DECIMALS);
  if (rate === 0n) throw new RangeError("zero rate");
  return divRound(
    cents * USDR_UNIT * 10n ** BigInt(RATE_DECIMALS),
    rate * 100n,
  );
}

/** USDr base units → local amount rounded to cents. */
function usdrToLocal(usdr: bigint, usdRate: string): number {
  const rate = parseDecimal(usdRate, RATE_DECIMALS);
  const cents = divRound(
    usdr * rate * 100n,
    USDR_UNIT * 10n ** BigInt(RATE_DECIMALS),
  );
  return Number(cents) / 100;
}

const CURRENCY_COUNTRY: Record<Currency, string> = {
  ARS: "AR",
  USD: "US",
  EUR: "ES",
  BRL: "BR",
  MXN: "MX",
  CLP: "CL",
};

/** "es" + ARS → "es-AR", so ARS shows as "$ 1.234,50" and not "1234,50 ARS". */
function moneyLocale(locale: string, currency: Currency): string {
  try {
    const parsed = new Intl.Locale(locale);
    if (parsed.region) return locale;
    const country =
      currency === "EUR"
        ? (({ pt: "PT", en: "IE" } as Record<string, string>)[
            parsed.language
          ] ?? "ES")
        : CURRENCY_COUNTRY[currency];
    return `${parsed.language}-${country}`;
  } catch {
    return locale;
  }
}

function formatMoney(
  amount: number,
  currency: Currency,
  locale: string,
): string {
  return new Intl.NumberFormat(moneyLocale(locale, currency), {
    style: "currency",
    currency,
  }).format(amount);
}

/** USDr amount shown in the user's currency; falls back to USD without a rate. */
function formatUsdr(
  usdr: bigint,
  currency: Currency,
  rates: FxRates,
  locale: string,
): string {
  const rate = currency === "USD" ? "1" : rates[currency];
  if (!rate) return formatMoney(usdrToLocal(usdr, "1"), "USD", locale);
  return formatMoney(usdrToLocal(usdr, rate), currency, locale);
}

export {
  CURRENCIES,
  currencyDigits,
  currencyForCountry,
  currencyForLanguageTag,
  formatMoney,
  formatUsdr,
  isCurrency,
  localToUsdr,
  parseDecimal,
  usdrToLocal,
};
export type { Currency, FxRates };
