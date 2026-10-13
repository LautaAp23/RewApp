import { afterEach, describe, expect, it, vi } from "vitest";
import { clearInvite, INVITE_TTL_MS, readInvite, saveInvite } from "./referral-storage";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("referral storage", () => {
  it("keeps the invite for 30 days", () => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    saveInvite("ana-7k2q", "Ana", 1_000);
    expect(readInvite(1_000 + INVITE_TTL_MS)).toEqual({ code: "ana-7k2q", alias: "Ana", savedAt: 1_000 });
    expect(readInvite(1_001 + INVITE_TTL_MS)).toBeNull();
  });
  it("clears it", () => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    saveInvite("ana-7k2q", null);
    clearInvite();
    expect(readInvite()).toBeNull();
  });
  it("never throws when storage is blocked", () => {
    const blocked = () => { throw new Error("SecurityError"); };
    vi.stubGlobal("window", { localStorage: { getItem: blocked, setItem: blocked, removeItem: blocked } });
    expect(() => saveInvite("ana-7k2q", "Ana")).not.toThrow();
    expect(readInvite()).toBeNull();
    expect(() => clearInvite()).not.toThrow();
  });
  it("ignores garbage", () => {
    const storage = memoryStorage();
    storage.setItem("rewapp.referral", "{not json");
    vi.stubGlobal("window", { localStorage: storage });
    expect(readInvite()).toBeNull();
  });
});
