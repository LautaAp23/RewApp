import { describe, expect, it } from "vitest";
import { TABS, activeTab, compactAfterScroll, isScanning, lensAtPointer } from "./nav";

describe("activeTab", () => {
  it("maps each tab's own route to its index", () => {
    expect(activeTab("/inicio")).toBe(0);
    expect(activeTab("/canjear")).toBe(1);
    expect(activeTab("/amigos")).toBe(2);
    expect(activeTab("/perfil")).toBe(3);
  });

  it("keeps the tab lit on the screens it owns", () => {
    expect(activeTab("/compartir/abc123")).toBe(2);
    expect(activeTab("/tarjetas/nueva")).toBe(3);
    expect(activeTab("/respaldo")).toBe(3);
    expect(activeTab("/comercio/nueva")).toBe(3);
    expect(activeTab("/comercio/recompensas")).toBe(3);
  });

  it("returns -1 where no tab applies", () => {
    expect(activeTab("/cargar")).toBe(-1);
    expect(activeTab("/escanear")).toBe(-1);
    expect(activeTab("/pagar/abc123")).toBe(-1);
  });

  it("matches whole path segments, not prefixes", () => {
    expect(activeTab("/perfilado")).toBe(-1);
    expect(activeTab("/inicio/")).toBe(0);
  });
});

describe("isScanning", () => {
  it("is true on the scanner and on the payment it opens", () => {
    expect(isScanning("/escanear")).toBe(true);
    expect(isScanning("/pagar/abc123")).toBe(true);
    expect(isScanning("/inicio")).toBe(false);
  });
});

describe("TABS", () => {
  it("lists the four tabs in nav order with their routes", () => {
    expect(TABS.map((tab) => [tab.key, tab.href])).toEqual([
      ["home", "/inicio"],
      ["redeem", "/canjear"],
      ["friends", "/amigos"],
      ["profile", "/perfil"],
    ]);
  });
});

describe("compactAfterScroll", () => {
  it("compacts when scrolling down past the top", () => {
    expect(compactAfterScroll(false, 10, 60, 1000)).toBe(true);
  });

  it("ignores small jitter either way", () => {
    expect(compactAfterScroll(true, 100, 103, 1000)).toBe(true);
    expect(compactAfterScroll(false, 100, 103, 1000)).toBe(false);
  });

  it("expands when scrolling up", () => {
    expect(compactAfterScroll(true, 200, 180, 1000)).toBe(false);
  });

  it("is always expanded at the top, including the overscroll bounce", () => {
    expect(compactAfterScroll(true, 20, 0, 1000)).toBe(false);
    expect(compactAfterScroll(true, 10, -30, 1000)).toBe(false);
  });

  it("does not compact for a short scroll near the top", () => {
    expect(compactAfterScroll(false, 0, 30, 1000)).toBe(false);
  });

  it("holds its state at the bottom, where the bounce would flap it", () => {
    expect(compactAfterScroll(true, 900, 1000, 1000)).toBe(true);
    expect(compactAfterScroll(false, 990, 1000, 1000)).toBe(false);
    expect(compactAfterScroll(true, 1000, 1040, 1000)).toBe(true);
  });

  it("never compacts a page that barely scrolls", () => {
    expect(compactAfterScroll(false, 0, 60, 80)).toBe(false);
  });
});

describe("lensAtPointer", () => {
  it("centers the lens on the tab under the pointer", () => {
    expect(lensAtPointer(50, 400, 4)).toBe(0);
    expect(lensAtPointer(150, 400, 4)).toBe(1);
    expect(lensAtPointer(350, 400, 4)).toBe(3);
  });

  it("moves continuously between tabs", () => {
    expect(lensAtPointer(200, 400, 4)).toBe(1.5);
  });

  it("stays inside the bar when the finger leaves it", () => {
    expect(lensAtPointer(-80, 400, 4)).toBe(0);
    expect(lensAtPointer(900, 400, 4)).toBe(3);
  });

  it("is 0 when there is nothing to measure", () => {
    expect(lensAtPointer(10, 0, 4)).toBe(0);
  });
});
