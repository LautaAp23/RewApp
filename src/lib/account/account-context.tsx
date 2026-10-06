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
import { contractAddresses } from "../contracts";
import { monadTestnet } from "viem/chains";
import type { PaymentIntent, RedeemIntent } from "../contracts/eip712";
import { accountFromEntropy, getRpId } from "./derive";
import {
  AccountError,
  type AccountErrorKey,
  humanAccountError,
} from "./errors";
import {
  type AccountEntropy,
  addBackupPasskey as storeBackupPasskey,
  createAccountPasskey,
  getAccountEntropy,
  type PasskeyKind,
} from "./passkey-flows";
import {
  createSessionPolicy,
  NeedsConfirmation,
  type SessionPolicy,
  type SignedPayment,
  type SignedRedeem,
  type SignOptions,
  type SpendLedger,
} from "./session-policy";

/** "expired": 15 min without activity or a reload; one passkey prompt resumes. */
type AccountStatus = "signed-out" | "busy" | "signed-in" | "expired";

type AccountContextValue = {
  status: AccountStatus;
  address: EvmAddress | undefined;
  kind: PasskeyKind | undefined;
  /** Translation key (`errors.<key>`) for the last failed action. */
  error: AccountErrorKey | undefined;
  /** A passkey was used on this device before. Only a UI hint. */
  hasCredentialHint: boolean;
  signIn(): Promise<boolean>;
  createAccount(): Promise<boolean>;
  addBackupPasskey(): Promise<boolean>;
  /** "Confirmá que sos vos": resumes an expired session of the same account. */
  confirmIdentity(): Promise<boolean>;
  endSession(): void;
  clearError(): void;
  /**
   * Signs through the session policy (docs/PLAN.md §4.3). Out of scope (over a
   * limit or expired) it prompts the passkey once. Throws on cancel or reject;
   * map with `humanAccountError`.
   */
  signPayment(intent: PaymentIntent, permitNonce: bigint): Promise<SignedPayment>;
  signRedeem(intent: RedeemIntent): Promise<SignedRedeem>;
};

type ActiveSession = {
  session: Secp256k1SigningSession;
  address: EvmAddress;
  policy: SessionPolicy | undefined;
  // Kept only right after account creation, so the backup passkey can be
  // added without another prompt.
  entropy: Uint8Array | undefined;
};

// Only the credentialId is stored: never keys, entropy or PRF output.
const CREDENTIAL_HINT_KEY = "rewapp:credential-hint";
// Survives a reload but not closing the tab: a reload asks to confirm the same account.
const SESSION_ADDRESS_KEY = "rewapp:session-address";
const ACTIVITY_EVENTS = ["pointerdown", "keydown"] as const;
const EXPIRY_CHECK_MS = 15_000;

const AccountContext = createContext<AccountContextValue | null>(null);

function wipe(active: ActiveSession | null) {
  if (!active) return;
  active.policy?.end();
  active.session.end();
  active.entropy?.fill(0);
}

function sameAddress(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

function createPolicy(signer: LocalAccount, ledger: SpendLedger) {
  const { usdr, rewAppPay } = contractAddresses;
  if (!usdr || !rewAppPay) return undefined;
  return createSessionPolicy(signer, {
    usdr,
    rewAppPay,
    chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? monadTestnet.id),
    ledger,
  });
}

function requirePolicy(active: ActiveSession) {
  if (!active.policy) {
    throw new Error(
      "NEXT_PUBLIC_USDR_ADDRESS and NEXT_PUBLIC_REWAPP_PAY_ADDRESS must be set",
    );
  }
  return active.policy;
}

function AccountProvider({ children }: { children: React.ReactNode }) {
  const activeRef = useRef<ActiveSession | null>(null);
  // Account of the current (possibly expired) session; cleared on sign out.
  const expectedRef = useRef<EvmAddress | null>(null);
  const ledgerRef = useRef<SpendLedger>({ day: 0, spent: 0n });
  const busyRef = useRef(false);
  const [status, setStatus] = useState<AccountStatus>("signed-out");
  const [address, setAddress] = useState<EvmAddress>();
  const [kind, setKind] = useState<PasskeyKind>();
  const [error, setError] = useState<AccountErrorKey>();
  const [hasCredentialHint, setHasCredentialHint] = useState(false);

  const idleStatus = useCallback((): AccountStatus => {
    if (activeRef.current) return "signed-in";
    return expectedRef.current ? "expired" : "signed-out";
  }, []);

  const expire = useCallback(() => {
    wipe(activeRef.current);
    activeRef.current = null;
    if (!busyRef.current) setStatus(idleStatus());
  }, [idleStatus]);

  useEffect(() => {
    setHasCredentialHint(localStorage.getItem(CREDENTIAL_HINT_KEY) !== null);
    const saved = sessionStorage.getItem(SESSION_ADDRESS_KEY);
    if (saved) {
      expectedRef.current = saved as EvmAddress;
      setAddress(saved as EvmAddress);
      setStatus("expired");
    }
    return () => {
      wipe(activeRef.current);
      activeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onActivity = () => activeRef.current?.policy?.touch();
    const check = () => {
      if (activeRef.current?.policy?.isExpired()) expire();
    };
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", check);
    const interval = window.setInterval(check, EXPIRY_CHECK_MS);
    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(interval);
    };
  }, [expire]);

  const run = useCallback(
    async (action: () => Promise<void>) => {
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
        setStatus(idleStatus());
      }
    },
    [idleStatus],
  );

  const start = useCallback(
    (
      { entropy, credentialId, kind }: AccountEntropy,
      keepEntropy: boolean,
      expected?: EvmAddress,
    ) => {
      let started = false;
      try {
        const account = accountFromEntropy(entropy);
        if (expected && !sameAddress(account.address, expected)) {
          account.session.end();
          throw new AccountError("WRONG_ACCOUNT", "passkey of another account");
        }
        wipe(activeRef.current);
        const active: ActiveSession = {
          session: account.session,
          address: account.address,
          policy: createPolicy(
            toViemAccount(account.session),
            ledgerRef.current,
          ),
          entropy: keepEntropy ? entropy : undefined,
        };
        activeRef.current = active;
        expectedRef.current = account.address;
        setAddress(account.address);
        setKind(kind);
        localStorage.setItem(CREDENTIAL_HINT_KEY, credentialId);
        sessionStorage.setItem(SESSION_ADDRESS_KEY, account.address);
        setHasCredentialHint(true);
        started = true;
        return active;
      } finally {
        if (!keepEntropy || !started) entropy.fill(0);
      }
    },
    [],
  );

  const signIn = useCallback(
    () => run(async () => void start(await getAccountEntropy(getRpId()), false)),
    [run, start],
  );

  const createAccount = useCallback(
    () =>
      run(async () => void start(await createAccountPasskey(getRpId()), true)),
    [run, start],
  );

  const confirmIdentity = useCallback(
    () =>
      run(async () => {
        const expected = expectedRef.current ?? undefined;
        void start(await getAccountEntropy(getRpId()), false, expected);
      }),
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
          if (!sameAddress(check.address, active.address)) {
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

  /**
   * Tries the session policy first; when the action is out of scope, asks for
   * the passkey once and signs with the account rebuilt from it.
   */
  const signScoped = useCallback(
    async <T,>(
      attempt: (policy: SessionPolicy, options?: SignOptions) => Promise<T>,
    ): Promise<T> => {
      if (busyRef.current) throw new Error("busy");
      const active = activeRef.current;
      if (active) {
        try {
          return await attempt(requirePolicy(active));
        } catch (caught) {
          if (!(caught instanceof NeedsConfirmation)) throw caught;
          if (caught.reason === "expired") expire();
        }
      }

      busyRef.current = true;
      setStatus("busy");
      try {
        const expected = expectedRef.current ?? undefined;
        const fresh = await getAccountEntropy(getRpId());
        const confirmed = accountFromEntropy(fresh.entropy);
        try {
          if (expected && !sameAddress(confirmed.address, expected)) {
            throw new AccountError(
              "WRONG_ACCOUNT",
              "passkey of another account",
            );
          }
          const current =
            activeRef.current ??
            start({ ...fresh, entropy: fresh.entropy.slice() }, false, expected);
          return await attempt(requirePolicy(current), {
            confirmedBy: toViemAccount(confirmed.session),
          });
        } finally {
          confirmed.session.end();
          fresh.entropy.fill(0);
        }
      } finally {
        busyRef.current = false;
        setStatus(idleStatus());
      }
    },
    [expire, idleStatus, start],
  );

  const signPayment = useCallback(
    (intent: PaymentIntent, permitNonce: bigint) =>
      signScoped((policy, options) =>
        policy.signPayment(intent, permitNonce, options),
      ),
    [signScoped],
  );

  const signRedeem = useCallback(
    (intent: RedeemIntent) =>
      signScoped((policy, options) => policy.signRedeem(intent, options)),
    [signScoped],
  );

  const endSession = useCallback(() => {
    wipe(activeRef.current);
    activeRef.current = null;
    expectedRef.current = null;
    sessionStorage.removeItem(SESSION_ADDRESS_KEY);
    setAddress(undefined);
    setKind(undefined);
    setError(undefined);
    setStatus("signed-out");
  }, []);

  const clearError = useCallback(() => setError(undefined), []);

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
      confirmIdentity,
      endSession,
      clearError,
      signPayment,
      signRedeem,
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
      confirmIdentity,
      endSession,
      clearError,
      signPayment,
      signRedeem,
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
