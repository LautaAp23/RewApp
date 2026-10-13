"use client";

import { useEffect, useState } from "react";
import { REGISTER_LOCK_EVENT, readRegisterLock, type RegisterLock } from "./register-lock";

function useRegisterLock(): RegisterLock | null {
  const [lock, setLock] = useState<RegisterLock | null>(null);
  useEffect(() => {
    const sync = () => setLock(readRegisterLock());
    sync();
    window.addEventListener(REGISTER_LOCK_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(REGISTER_LOCK_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return lock;
}

export { useRegisterLock };
