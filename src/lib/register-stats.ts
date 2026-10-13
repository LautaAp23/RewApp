import { parseDecimal } from "./money";

type PaidCharge = {
  registerId: string | null;
  payer: string | null;
  localAmount: string;
  createdAt: Date;
};

type DayStat = { date: string; customers: number; sales: string };

type RegisterStat = {
  id: string;
  days: DayStat[];
  weekCustomers: number;
  weekSales: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_DAYS = 7;
const HISTORY_DAYS = 30;

function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function centsToDecimal(cents: bigint): string {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

/** UTC dates ending today, oldest first. */
function datesEndingToday(count: number, now = new Date()): string[] {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: count }, (_, index) => utcDate(new Date(start - (count - 1 - index) * DAY_MS)));
}

/** The seven UTC dates ending today, oldest first. */
function lastSevenDates(now = new Date()): string[] {
  return datesEndingToday(WEEK_DAYS, now);
}

/**
 * Customers are distinct payers of paid charges. Sales are the sum of those
 * charges in the business currency, as a 2-decimal string.
 */
function summarizeRegisters(
  registers: { id: string }[],
  charges: PaidCharge[],
  now = new Date(),
): { registers: RegisterStat[]; days: DayStat[]; weekCustomers: number; weekSales: string } {
  const dates = datesEndingToday(HISTORY_DAYS, now);
  const weekDates = new Set(dates.slice(-WEEK_DAYS));
  const dateSet = new Set(dates);
  const byRegister = new Map(
    registers.map((register) => [
      register.id,
      {
        days: new Map(dates.map((date) => [date, { payers: new Set<string>(), cents: 0n }])),
        payers: new Set<string>(),
        cents: 0n,
      },
    ]),
  );
  const weekPayers = new Set<string>();
  let weekCents = 0n;

  for (const charge of charges) {
    if (!charge.registerId) continue;
    const bucket = byRegister.get(charge.registerId);
    const date = utcDate(charge.createdAt);
    if (!bucket || !dateSet.has(date)) continue;
    const cents = parseDecimal(charge.localAmount, 2);
    const day = bucket.days.get(date);
    if (!day) continue;
    day.cents += cents;
    if (weekDates.has(date)) bucket.cents += cents;
    if (weekDates.has(date)) weekCents += cents;
    if (charge.payer) {
      day.payers.add(charge.payer);
      if (weekDates.has(date)) {
        bucket.payers.add(charge.payer);
        weekPayers.add(charge.payer);
      }
    }
  }

  return {
    weekCustomers: weekPayers.size,
    weekSales: centsToDecimal(weekCents),
    days: dates.map((date) => {
      let customers = 0;
      let cents = 0n;
      for (const register of registers) {
        const day = byRegister.get(register.id)!.days.get(date)!;
        customers += day.payers.size;
        cents += day.cents;
      }
      return { date, customers, sales: centsToDecimal(cents) };
    }),
    registers: registers.map((register) => {
      const bucket = byRegister.get(register.id)!;
      return {
        id: register.id,
        weekCustomers: bucket.payers.size,
        weekSales: centsToDecimal(bucket.cents),
        days: dates.map((date) => {
          const day = bucket.days.get(date)!;
          return { date, customers: day.payers.size, sales: centsToDecimal(day.cents) };
        }),
      };
    }),
  };
}

export { HISTORY_DAYS, WEEK_DAYS, lastSevenDates, summarizeRegisters };
export type { DayStat, PaidCharge, RegisterStat };
