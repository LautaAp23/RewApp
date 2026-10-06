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
  return divRound(cents * USDR_UNIT * 10n ** BigInt(RATE_DECIMALS), rate * 100n);
}

/** USDr base units → local amount rounded to cents. */
function usdrToLocal(usdr: bigint, usdRate: string): number {
  const rate = parseDecimal(usdRate, RATE_DECIMALS);
  const cents = divRound(usdr * rate * 100n, USDR_UNIT * 10n ** BigInt(RATE_DECIMALS));
  return Number(cents) / 100;
}

function formatMoney(amount: number, currency: Currency, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
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
  currencyForCountry,
  formatMoney,
  formatUsdr,
  isCurrency,
  localToUsdr,
  parseDecimal,
  usdrToLocal,
};
export type { Currency, FxRates };
