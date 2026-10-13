import { describe, expect, it } from "vitest";
import { lastSevenDates, summarizeRegisters } from "./register-stats";

const now = new Date("2026-10-12T18:00:00.000Z");

describe("semana de una caja", () => {
  it("cubre siete días terminando hoy", () => {
    expect(lastSevenDates(now)).toEqual([
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
    ]);
  });

  it("cuenta clientes distintos y suma las ventas por caja y por día", () => {
    const summary = summarizeRegisters(
      [{ id: "a" }, { id: "b" }],
      [
        { registerId: "a", payer: "0x1", localAmount: "10.50", createdAt: new Date("2026-10-12T10:00:00.000Z") },
        { registerId: "a", payer: "0x1", localAmount: "4.50", createdAt: new Date("2026-10-12T12:00:00.000Z") },
        { registerId: "a", payer: "0x2", localAmount: "5.00", createdAt: new Date("2026-10-11T12:00:00.000Z") },
        { registerId: "b", payer: "0x2", localAmount: "20.00", createdAt: new Date("2026-10-12T09:00:00.000Z") },
        { registerId: null, payer: "0x9", localAmount: "100.00", createdAt: new Date("2026-10-12T09:00:00.000Z") },
        { registerId: "a", payer: "0x3", localAmount: "1.00", createdAt: new Date("2026-10-01T09:00:00.000Z") },
      ],
      now,
    );
    const caja = summary.registers[0];
    const on = (id: string, date: string) => summary.registers.find((item) => item.id === id)!.days.find((day) => day.date === date);
    expect(on("a", "2026-10-12")).toEqual({ date: "2026-10-12", customers: 1, sales: "15.00" });
    expect(on("a", "2026-10-11")).toEqual({ date: "2026-10-11", customers: 1, sales: "5.00" });
    expect(on("a", "2026-10-01")).toEqual({ date: "2026-10-01", customers: 1, sales: "1.00" });
    expect(caja.weekCustomers).toBe(2);
    expect(caja.weekSales).toBe("20.00");
    expect(summary.registers[1].weekSales).toBe("20.00");
    expect(summary.weekCustomers).toBe(2);
    expect(summary.weekSales).toBe("40.00");
    expect(summary.days.find((day) => day.date === "2026-10-12")).toEqual({
      date: "2026-10-12",
      customers: 2,
      sales: "35.00",
    });
    expect(summary.days.find((day) => day.date === "2026-10-11")).toEqual({
      date: "2026-10-11",
      customers: 1,
      sales: "5.00",
    });
  });
});
