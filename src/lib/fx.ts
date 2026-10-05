import { db } from "./db";
import { type Currency, type FxRates, isCurrency } from "./money";

type FxTable = { rates: FxRates; updatedAt: string | null };

async function getFxTable(): Promise<FxTable> {
  const rows = await db.fxRate.findMany();
  const rates: FxRates = {};
  let updatedAt: Date | null = null;
  for (const row of rows) {
    if (!isCurrency(row.currency)) continue;
    rates[row.currency] = row.usdRate.toString();
    if (!updatedAt || row.updatedAt > updatedAt) updatedAt = row.updatedAt;
  }
  return { rates, updatedAt: updatedAt?.toISOString() ?? null };
}

async function getUsdRate(currency: Currency): Promise<string | undefined> {
  if (currency === "USD") return "1";
  const row = await db.fxRate.findUnique({ where: { currency } });
  return row?.usdRate.toString();
}

export { getFxTable, getUsdRate };
export type { FxTable };
