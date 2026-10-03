"use client";

import type { EvmAddress, Secp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { LocalAccount } from "viem";
import { accountFromEntropy, getRpId } from "./derive";
import { AccountError, humanAccountError } from "./errors";
import {
  type AccountEntropy,
  addBackupPasskey as storeBackupPasskey,
  createAccountPasskey,
  getAccountEntropy,
  type PasskeyKind,
} from "./passkey-flows";

type AccountStatus = "signed-out" | "busy" | "signed-in";

type AccountContextValue = {
  status: AccountStatus;
  address: EvmAddress | undefined;
  kind: PasskeyKind | undefined;
  /** Human-readable message for the last failed action. */
  error: string | undefined;
  /** A passkey was used on this device before. Only a UI hint. */
  hasCredentialHint: boolean;
  signIn(): Promise<boolean>;
  createAccount(): Promise<boolean>;
  addBackupPasskey(): Promise<boolean>;
  endSession(): void;
  clearError(): void;
  /** Viem account backed by the in-memory session. Throws when signed out. */
  getSigner(): LocalAccount<"mera">;
};

type ActiveSession = {
  session: Secp256k1SigningSession;
  signer: LocalAccount<"mera">;
  // Kept only right after account creation, so the backup passkey can be
  // added without another prompt.
  entropy: Uint8Array | undefined;
};

// Only the credentialId is stored: never keys, entropy or PRF output.
const CREDENTIAL_HINT_KEY = "rewapp:credential-hint";

const AccountContext = createContext<AccountContextValue | null>(null);

function wipe(active: ActiveSession | null) {
  if (!active) return;
  active.session.end();
  active.entropy?.fill(0);
}

function AccountProvider({ children }: { children: React.ReactNode }) {
  const activeRef = useRef<ActiveSession | null>(null);
  const busyRef = useRef(false);
  const [status, setStatus] = useState<AccountStatus>("signed-out");
  const [address, setAddress] = useState<EvmAddress>();
  const [kind, setKind] = useState<PasskeyKind>();
  const [error, setError] = useState<string>();
  const [hasCredentialHint, setHasCredentialHint] = useState(false);

  useEffect(() => {
    setHasCredentialHint(localStorage.getItem(CREDENTIAL_HINT_KEY) !== null);
    return () => {
      wipe(activeRef.current);
      activeRef.current = null;
    };
  }, []);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setStatus("busy");
    setError(undefined);
    try {
      await action();
      return true;
    } catch (caught) {
      setError(humanAccountError(caught));
      return false;
    } finally {
      busyRef.current = false;
      setStatus(activeRef.current ? "signed-in" : "signed-out");
    }
  }, []);

  const start = useCallback(
    ({ entropy, credentialId, kind }: AccountEntropy, keepEntropy: boolean) => {
      let started = false;
      try {
        const account = accountFromEntropy(entropy);
        wipe(activeRef.current);
        activeRef.current = {
          session: account.session,
          signer: toViemAccount(account.session),
          entropy: keepEntropy ? entropy : undefined,
        };
        setAddress(account.address);
        setKind(kind);
        localStorage.setItem(CREDENTIAL_HINT_KEY, credentialId);
        setHasCredentialHint(true);
        started = true;
      } finally {
        if (!keepEntropy || !started) entropy.fill(0);
      }
    },
    [],
  );

  const signIn = useCallback(
    () => run(async () => start(await getAccountEntropy(getRpId()), false)),
    [run, start],
  );

  const createAccount = useCallback(
    () => run(async () => start(await createAccountPasskey(getRpId()), true)),
    [run, start],
  );

  const addBackupPasskey = useCallback(
    () =>
      run(async () => {
        const active = activeRef.current;
        if (!active) throw new AccountError("WRONG_ACCOUNT", "signed out");
        const rpId = getRpId();
        if (active.entropy) {
          await storeBackupPasskey(rpId, active.entropy);
          return;
        }
        const { entropy } = await getAccountEntropy(rpId);
        try {
          const check = accountFromEntropy(entropy);
          check.session.end();
          if (check.address !== active.signer.address) {
            throw new AccountError(
              "WRONG_ACCOUNT",
              "passkey of another account",
            );
          }
          await storeBackupPasskey(rpId, entropy);
        } finally {
          entropy.fill(0);
        }
      }),
    [run],
  );

  const endSession = useCallback(() => {
    wipe(activeRef.current);
    activeRef.current = null;
    setAddress(undefined);
    setKind(undefined);
    setError(undefined);
    setStatus("signed-out");
  }, []);

  const clearError = useCallback(() => setError(undefined), []);

  const getSigner = useCallback(() => {
    const active = activeRef.current;
    if (!active) throw new Error("No hay una sesión activa");
    return active.signer;
  }, []);

  const value = useMemo<AccountContextValue>(
    () => ({
      status,
      address,
      kind,
      error,
      hasCredentialHint,
      signIn,
      createAccount,
      addBackupPasskey,
      endSession,
      clearError,
      getSigner,
    }),
    [
      status,
      address,
      kind,
      error,
      hasCredentialHint,
      signIn,
      createAccount,
      addBackupPasskey,
      endSession,
      clearError,
      getSigner,
    ],
  );

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}

function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useAccount necesita un <AccountProvider>");
  return value;
}

export { AccountProvider, useAccount };
export type { AccountContextValue, AccountStatus };
