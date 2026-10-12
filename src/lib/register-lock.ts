import { getAddress, isAddress } from "viem";
import { isDerivationIndex } from "./merchant-index";

type RegisterLock = {
  merchant: `0x${string}`;
  registerId: string;
  derivationIndex: number;
};

const STORAGE_KEY = "rewapp-register-lock";
const REGISTER_LOCK_EVENT = "rewapp:register-lock";

function registerChargePath(lock: RegisterLock): string {
  return `/comercio/${lock.merchant}/cobrar`;
}

function isRegisterChargePath(pathname: string, lock: RegisterLock): boolean {
  return pathname.toLowerCase() === registerChargePath(lock).toLowerCase();
}

function parseRegisterLock(value: string | null): RegisterLock | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<RegisterLock>;
    if (
      typeof parsed.merchant !== "string" ||
      !isAddress(parsed.merchant) ||
      typeof parsed.registerId !== "string" ||
      parsed.registerId.length === 0 ||
      !isDerivationIndex(parsed.derivationIndex)
    ) {
      return null;
    }
    return {
      merchant: getAddress(parsed.merchant),
      registerId: parsed.registerId,
      derivationIndex: parsed.derivationIndex,
    };
  } catch {
    return null;
  }
}

function readRegisterLock(): RegisterLock | null {
  if (typeof localStorage === "undefined") return null;
  return parseRegisterLock(localStorage.getItem(STORAGE_KEY));
}

function writeRegisterLock(lock: RegisterLock): void {
  const stored: RegisterLock = {
    merchant: getAddress(lock.merchant),
    registerId: lock.registerId,
    derivationIndex: lock.derivationIndex,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  window.dispatchEvent(new Event(REGISTER_LOCK_EVENT));
}

function clearRegisterLock(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(REGISTER_LOCK_EVENT));
}

export {
  REGISTER_LOCK_EVENT,
  clearRegisterLock,
  isRegisterChargePath,
  parseRegisterLock,
  readRegisterLock,
  registerChargePath,
  writeRegisterLock,
};
export type { RegisterLock };
