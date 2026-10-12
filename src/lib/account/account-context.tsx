"use client";

import {
  workspaceActions,
  workspaceActionTypes,
  type WorkspaceAction,
  type WorkspaceRequest,
} from "../workspace-types";
import {
  ruleIntentTypes,
  rewAppPayDomain,
  type RuleIntent,
} from "../contracts/eip712";
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
import { contractAddresses, requireContractAddresses, rewAppPayAbi } from "../contracts";
import { chainClient } from "../chain-client";
import {
  addDemoCardTypes,
  createChargeTypes,
  merchantIntentTypes,
  merchantOwnershipTypes,
  type MerchantProfileFields,
  merchantProfileTypes,
  profileUpdateTypes,
  rewAppApiDomain,
} from "../api/typed-data";
import { isCurrency, type Currency } from "../money";
import { findDemoCard } from "../demo-cards";
import { monadTestnet } from "viem/chains";
import type { PaymentIntent, RedeemIntent } from "../contracts/eip712";
import { isDerivationIndex } from "../merchant-index";
import { accountFromEntropy, addressFromEntropy, getRpId } from "./derive";
import { fetchRoles, readRememberedRole, rememberRole, type RoleName, type Roles } from "./roles";
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
  /** False until the saved session (if any) was read after mount. */
  ready: boolean;
  status: AccountStatus;
  address: EvmAddress | undefined;
  kind: PasskeyKind | undefined;
  /** Translation key (`errors.<key>`) for the last failed action. */
  error: AccountErrorKey | undefined;
  /** A passkey was used on this device before. Only a UI hint. */
  hasCredentialHint: boolean;
  /** Merchant identity of the same passkey. An address, not a live session. */
  merchantAddress: EvmAddress | undefined;
  /** Which identities already exist. Undefined until the query answers. */
  roles: Roles | undefined;
  activeRole: RoleName;
  switchRole(role: RoleName): void;
  /** Re-reads the roles. Call it after a sign-up so the UI stops lying. */
  refreshRoles(): Promise<void>;
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
  signPayment(
    intent: PaymentIntent,
    permitNonce: bigint,
  ): Promise<SignedPayment>;
  signRedeem(intent: RedeemIntent): Promise<SignedRedeem>;
  signProfileUpdate(values: {
    alias: string;
    country: string;
    currency: Currency;
    birthDay: string;
    birthMonth: string;
  }): Promise<{
    alias: string;
    country: string;
    currency: Currency;
    birthDay: string;
    birthMonth: string;
    deadline: string;
    signature: `0x${string}`;
  }>;
  signWorkspace(
    action: WorkspaceAction,
    payload: Record<string, unknown>,
  ): Promise<WorkspaceRequest>;
  signMerchantRule(intent: RuleIntent, derivationIndex: number): Promise<`0x${string}`>;
  signCreateCharge(values: {
    merchant: EvmAddress;
    localAmount: string;
    currency: string;
    derivationIndex: number;
  }): Promise<{
    merchant: EvmAddress;
    localAmount: string;
    currency: string;
    deadline: string;
    signature: `0x${string}`;
  }>;
  /** Asks for the passkey and checks it belongs to the signed-in person. */
  confirmPasskey(): Promise<void>;
  /** Links an already registered business to this profile. One passkey prompt. */
  signMerchantClaim(
    derivationIndex: number,
  ): Promise<{
    owner: EvmAddress;
    merchant: EvmAddress;
    derivationIndex: string;
    deadline: string;
    ownershipSignature: `0x${string}`;
    merchantSignature: `0x${string}`;
  }>;
  signAddDemoCard(demoId: string): Promise<{
    accountAddress: EvmAddress;
    demoId: string;
    deadline: string;
    signature: `0x${string}`;
  }>;
  /** One fresh ceremony, both signatures the merchant sign-up needs. */
  signMerchantRegistration(
    profile: MerchantProfileFields,
    derivationIndex: number,
  ): Promise<
    MerchantProfileFields & {
      merchant: EvmAddress;
      owner: EvmAddress;
      derivationIndex: string;
      nonce: string;
      deadline: string;
      profileSignature: `0x${string}`;
      intentSignature: `0x${string}`;
      ownershipSignature: `0x${string}`;
    }
  >;
  /** Only right after creating the account, while the entropy is in memory. */
  signProfile(values: { alias: string; email: string; country: string; currency: string }): Promise<{
    alias: string;
    email: string;
    country: string;
    currency: string;
    deadline: string;
    signature: `0x${string}`;
    address: EvmAddress;
  }>;
};

type ActiveSession = {
  session: Secp256k1SigningSession;
  address: EvmAddress;
  merchantAddress: EvmAddress;
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
  const [ready, setReady] = useState(false);
  const [merchantAddress, setMerchantAddress] = useState<EvmAddress>();
  const [roles, setRoles] = useState<Roles>();
  const [activeRole, setActiveRole] = useState<RoleName>("person");

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
    setReady(true);
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
        // Copia: addressFromEntropy pone en cero el buffer que recibe, y
        // start todavía necesita la entropía si keepEntropy es true.
        const merchant = addressFromEntropy(entropy.slice(), "merchant");
        wipe(activeRef.current);
        const active: ActiveSession = {
          session: account.session,
          address: account.address,
          merchantAddress: merchant,
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
        setMerchantAddress(merchant);
        void fetchRoles({ person: account.address, merchant }).then((found) => {
          // The answer can land after a sign-out or an account change: without
          // this guard it would resurrect roles, or show the previous account's.
          if (activeRef.current?.address !== account.address) return;
          setRoles(found);
          setActiveRole(found.merchant ? readRememberedRole() : "person");
        });
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
    () =>
      run(async () => void start(await getAccountEntropy(getRpId()), false)),
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
            start(
              { ...fresh, entropy: fresh.entropy.slice() },
              false,
              expected,
            );
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

  /**
   * Re-reads which identities exist. Needed right after a merchant sign-up:
   * without this the menu keeps offering to register a business that already
   * exists. Drops a stale answer if the session changed while it was in
   * flight, so it can never paint another account's business.
   */
  const refreshRoles = useCallback(async () => {
    const active = activeRef.current;
    if (!active) return;
    const found = await fetchRoles({ person: active.address, merchant: active.merchantAddress });
    if (activeRef.current?.address !== active.address) return;
    setRoles(found);
  }, []);

  const switchRole = useCallback((role: RoleName) => {
    setActiveRole(role);
    rememberRole(role);
  }, []);

  const endSession = useCallback(() => {
    wipe(activeRef.current);
    activeRef.current = null;
    expectedRef.current = null;
    sessionStorage.removeItem(SESSION_ADDRESS_KEY);
    void fetch("/api/workspace/session", { method: "DELETE" });
    setAddress(undefined);
    setKind(undefined);
    setError(undefined);
    setMerchantAddress(undefined);
    setRoles(undefined);
    setActiveRole("person");
    setStatus("signed-out");
  }, []);

  // Off-chain writes always require fresh confirmation; never extend the spending policy.
  const signAddDemoCard = useCallback(
    async (demoId: string) => {
      const expected = expectedRef.current;
      if (busyRef.current || !expected || !findDemoCard(demoId))
        throw new Error("unavailable");
      busyRef.current = true;
      setStatus("busy");
      let fresh: AccountEntropy | undefined;
      try {
        fresh = await getAccountEntropy(getRpId());
        if (!expectedRef.current || !sameAddress(expectedRef.current, expected))
          throw new Error("session changed");
        const active = start(fresh, false, expected);
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
        const signature = await toViemAccount(active.session).signTypedData({
          domain: rewAppApiDomain(),
          types: addDemoCardTypes,
          primaryType: "AddDemoCard",
          message: { account: active.address, demoId, deadline },
        });
        return {
          accountAddress: active.address,
          demoId,
          deadline: deadline.toString(),
          signature,
        };
      } finally {
        fresh?.entropy.fill(0);
        busyRef.current = false;
        setStatus(idleStatus());
      }
    },
    [idleStatus, start],
  );

  const signProfileUpdate = useCallback(
    async (values: {
      alias: string;
      country: string;
      currency: Currency;
      birthDay: string;
      birthMonth: string;
    }) => {
      const expected = expectedRef.current;
      const alias = values.alias.trim(),
        country = values.country.toUpperCase();
      const birthDay = values.birthDay.trim(),
        birthMonth = values.birthMonth.trim();
      if (
        busyRef.current ||
        !expected ||
        alias.length > 40 ||
        (country !== "" && !/^[A-Z]{2}$/.test(country)) ||
        !isCurrency(values.currency) ||
        (birthDay !== "" && !/^\d{1,2}$/.test(birthDay)) ||
        (birthMonth !== "" && !/^\d{1,2}$/.test(birthMonth))
      )
        throw new Error("unavailable");
      busyRef.current = true;
      setStatus("busy");
      let fresh: AccountEntropy | undefined;
      try {
        fresh = await getAccountEntropy(getRpId());
        if (expectedRef.current !== expected)
          throw new Error("session changed");
        const active = start(fresh, false, expected);
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
        const signature = await toViemAccount(active.session).signTypedData({
          domain: rewAppApiDomain(
            Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143),
          ),
          types: profileUpdateTypes,
          primaryType: "ProfileUpdate",
          message: {
            account: active.address,
            alias,
            email: "",
            country,
            currency: values.currency,
            birthDay,
            birthMonth,
            deadline,
          },
        });
        return {
          alias,
          country,
          currency: values.currency,
          birthDay,
          birthMonth,
          deadline: deadline.toString(),
          signature,
        };
      } finally {
        fresh?.entropy.fill(0);
        busyRef.current = false;
        setStatus(idleStatus());
      }
    },
    [idleStatus, start],
  );

  // Only these named off-chain actions are exposed; each asks for a fresh passkey.
  const signWorkspace = useCallback(
    async (
      action: WorkspaceAction,
      payload: Record<string, unknown>,
    ): Promise<WorkspaceRequest> => {
      const expected = expectedRef.current;
      if (busyRef.current || !expected || !workspaceActions.includes(action))
        throw new Error("unavailable");
      busyRef.current = true;
      setStatus("busy");
      let fresh: AccountEntropy | undefined;
      try {
        fresh = await getAccountEntropy(getRpId());
        if (expectedRef.current !== expected)
          throw new Error("session changed");
        const active = start(fresh, false, expected);
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
        const message = {
          account: active.address,
          action,
          payload: JSON.stringify(payload),
          requestId: crypto.randomUUID(),
          deadline,
        };
        const signature = await toViemAccount(active.session).signTypedData({
          domain: rewAppApiDomain(
            Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143),
          ),
          types: workspaceActionTypes,
          primaryType: "WorkspaceAction",
          message,
        });
        return { ...message, deadline: deadline.toString(), signature };
      } finally {
        fresh?.entropy.fill(0);
        busyRef.current = false;
        setStatus(idleStatus());
      }
    },
    [idleStatus, start],
  );

  const signMerchantRule = useCallback(
    async (intent: RuleIntent, derivationIndex: number): Promise<`0x${string}`> => {
      const expected = expectedRef.current;
      if (busyRef.current || !expected || !contractAddresses.rewAppPay || !isDerivationIndex(derivationIndex)) {
        throw new Error("unavailable");
      }
      busyRef.current = true;
      setStatus("busy");
      let fresh: AccountEntropy | undefined;
      try {
        fresh = await getAccountEntropy(getRpId());
        if (expectedRef.current !== expected) throw new Error("session changed");
        const person = accountFromEntropy(fresh.entropy, "person");
        try {
          if (!sameAddress(person.address, expected)) {
            throw new AccountError("WRONG_ACCOUNT", "passkey of another account");
          }
        } finally {
          person.session.end();
        }
        const merchant = accountFromEntropy(fresh.entropy, "merchant", derivationIndex);
        try {
          if (!sameAddress(merchant.address, intent.merchant)) {
            throw new AccountError("WRONG_ACCOUNT", "passkey of another account");
          }
          return await toViemAccount(merchant.session).signTypedData({
            domain: rewAppPayDomain(
              contractAddresses.rewAppPay,
              Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143),
            ),
            types: ruleIntentTypes,
            primaryType: "RuleIntent",
            message: intent,
          });
        } finally {
          merchant.session.end();
        }
      } finally {
        fresh?.entropy.fill(0);
        busyRef.current = false;
        setStatus(idleStatus());
      }
    },
    [idleStatus],
  );

  const signCreateCharge = useCallback(
    async (values: { merchant: EvmAddress; localAmount: string; currency: string; derivationIndex: number }) => {
      const expected = expectedRef.current;
      if (
        busyRef.current ||
        !expected ||
        !isDerivationIndex(values.derivationIndex) ||
        !/^\d+(\.\d{1,2})?$/.test(values.localAmount)
      ) {
        throw new Error("unavailable");
      }
      busyRef.current = true;
      setStatus("busy");
      let fresh: AccountEntropy | undefined;
      try {
        fresh = await getAccountEntropy(getRpId());
        if (expectedRef.current !== expected) throw new Error("session changed");
        const person = accountFromEntropy(fresh.entropy, "person");
        try {
          if (!sameAddress(person.address, expected)) {
            throw new AccountError("WRONG_ACCOUNT", "passkey of another account");
          }
        } finally {
          person.session.end();
        }
        const merchant = accountFromEntropy(fresh.entropy, "merchant", values.derivationIndex);
        try {
          if (!sameAddress(merchant.address, values.merchant)) {
            throw new AccountError("WRONG_ACCOUNT", "passkey of another account");
          }
          const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
          const message = {
            merchant: merchant.address,
            localAmount: values.localAmount,
            currency: values.currency,
            deadline,
          };
          const signature = await toViemAccount(merchant.session).signTypedData({
            domain: rewAppApiDomain(),
            types: createChargeTypes,
            primaryType: "CreateCharge",
            message,
          });
          return { ...message, deadline: deadline.toString(), signature };
        } finally {
          merchant.session.end();
        }
      } finally {
        fresh?.entropy.fill(0);
        busyRef.current = false;
        setStatus(idleStatus());
      }
    },
    [idleStatus],
  );

  const confirmPasskey = useCallback(async () => {
    const expected = expectedRef.current;
    if (busyRef.current || !expected) throw new Error("unavailable");
    busyRef.current = true;
    setStatus("busy");
    let fresh: AccountEntropy | undefined;
    try {
      fresh = await getAccountEntropy(getRpId());
      if (expectedRef.current !== expected) throw new Error("session changed");
      const person = accountFromEntropy(fresh.entropy, "person");
      try {
        if (!sameAddress(person.address, expected)) {
          throw new AccountError("WRONG_ACCOUNT", "passkey of another account");
        }
      } finally {
        person.session.end();
      }
    } finally {
      fresh?.entropy.fill(0);
      busyRef.current = false;
      setStatus(idleStatus());
    }
  }, [idleStatus]);

  const signMerchantClaim = useCallback(async (derivationIndex: number) => {
    const expected = expectedRef.current;
    if (busyRef.current || !expected || !isDerivationIndex(derivationIndex)) throw new Error("unavailable");
    busyRef.current = true;
    setStatus("busy");
    let fresh: AccountEntropy | undefined;
    try {
      fresh = await getAccountEntropy(getRpId());
      if (expectedRef.current !== expected) throw new Error("session changed");
      const person = accountFromEntropy(fresh.entropy, "person");
      const merchant = accountFromEntropy(fresh.entropy, "merchant", derivationIndex);
      try {
        if (!sameAddress(person.address, expected)) {
          throw new AccountError("WRONG_ACCOUNT", "passkey of another account");
        }
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
        const message = {
          owner: person.address,
          merchant: merchant.address,
          derivationIndex: BigInt(derivationIndex),
          deadline,
        };
        const ownershipSignature = await toViemAccount(person.session).signTypedData({
          domain: rewAppApiDomain(),
          types: merchantOwnershipTypes,
          primaryType: "MerchantOwnership",
          message,
        });
        const merchantSignature = await toViemAccount(merchant.session).signTypedData({
          domain: rewAppApiDomain(),
          types: merchantOwnershipTypes,
          primaryType: "MerchantOwnership",
          message,
        });
        return {
          owner: person.address,
          merchant: merchant.address,
          derivationIndex: String(derivationIndex),
          deadline: deadline.toString(),
          ownershipSignature,
          merchantSignature,
        };
      } finally {
        person.session.end();
        merchant.session.end();
      }
    } finally {
      fresh?.entropy.fill(0);
      busyRef.current = false;
      setStatus(idleStatus());
    }
  }, [idleStatus]);

  /**
   * Signs a ProfileUpdate with the entropy that is still in memory right after
   * creating the account, so registration costs no extra prompt. It refuses to
   * sign once that entropy is gone: a later edit of the profile has to go
   * through a fresh ceremony like any other off-chain write (PLAN §4.3).
   */
  const signProfile = useCallback(
    async (values: { alias: string; email: string; country: string; currency: string }) => {
      const active = activeRef.current;
      if (!active) throw new AccountError("WRONG_ACCOUNT", "signed out");
      if (!active.entropy) throw new Error("profile signing needs a fresh ceremony");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
      const message = { account: active.address, ...values, birthDay: "", birthMonth: "", deadline };
      const signature = await toViemAccount(active.session).signTypedData({
        domain: rewAppApiDomain(),
        types: profileUpdateTypes,
        primaryType: "ProfileUpdate",
        message,
      });
      return { ...values, deadline: deadline.toString(), signature, address: active.address };
    },
    [],
  );

  /**
   * One fresh passkey confirmation produces BOTH signatures the sign-up needs:
   * the profile for our API and the MerchantIntent the contract verifies. The
   * merchant signing session is derived here and closed right away; the policy
   * can sign neither of these by construction.
   */
  const signMerchantRegistration = useCallback(
    async (profile: MerchantProfileFields, derivationIndex: number) => {
      const expected = expectedRef.current;
      if (busyRef.current || !expected || !isDerivationIndex(derivationIndex)) throw new Error("unavailable");
      const { rewAppPay } = requireContractAddresses();
      busyRef.current = true;
      setStatus("busy");
      let fresh: AccountEntropy | undefined;
      try {
        fresh = await getAccountEntropy(getRpId());
        const person = accountFromEntropy(fresh.entropy, "person");
        const merchant = accountFromEntropy(fresh.entropy, "merchant", derivationIndex);
        try {
          if (!sameAddress(person.address, expected)) {
            throw new AccountError("WRONG_ACCOUNT", "passkey of another account");
          }
          const signer = toViemAccount(merchant.session);
          const nonce = await chainClient.readContract({
            address: rewAppPay,
            abi: rewAppPayAbi,
            functionName: "nonces",
            args: [merchant.address],
          });
          const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
          const message = { merchant: merchant.address, ...profile, deadline };
          const ownershipSignature = await toViemAccount(person.session).signTypedData({
            domain: rewAppApiDomain(),
            types: merchantOwnershipTypes,
            primaryType: "MerchantOwnership",
            message: {
              owner: person.address,
              merchant: merchant.address,
              derivationIndex: BigInt(derivationIndex),
              deadline,
            },
          });
          const profileSignature = await signer.signTypedData({
            domain: rewAppApiDomain(),
            types: merchantProfileTypes,
            primaryType: "MerchantProfile",
            message,
          });
          const intentSignature = await signer.signTypedData({
            domain: rewAppPayDomain(rewAppPay, Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? monadTestnet.id)),
            types: merchantIntentTypes,
            primaryType: "MerchantIntent",
            message: { merchant: merchant.address, nonce, deadline },
          });
          return {
            ...profile,
            merchant: merchant.address,
            owner: person.address,
            derivationIndex: String(derivationIndex),
            nonce: nonce.toString(),
            deadline: deadline.toString(),
            profileSignature,
            intentSignature,
            ownershipSignature,
          };
        } finally {
          person.session.end();
          merchant.session.end();
        }
      } finally {
        fresh?.entropy.fill(0);
        busyRef.current = false;
        setStatus(idleStatus());
      }
    },
    [idleStatus],
  );

  const clearError = useCallback(() => setError(undefined), []);

  const value = useMemo<AccountContextValue>(
    () => ({
      ready,
      status,
      address,
      kind,
      error,
      hasCredentialHint,
      merchantAddress,
      roles,
      activeRole,
      switchRole,
      refreshRoles,
      signIn,
      createAccount,
      addBackupPasskey,
      confirmIdentity,
      endSession,
      clearError,
      signPayment,
      signRedeem,
      signAddDemoCard,
      signProfileUpdate,
      signWorkspace,
      signMerchantRule,
      signCreateCharge,
      confirmPasskey,
      signMerchantClaim,
      signProfile,
      signMerchantRegistration,
    }),
    [
      ready,
      status,
      address,
      kind,
      error,
      hasCredentialHint,
      merchantAddress,
      roles,
      activeRole,
      switchRole,
      refreshRoles,
      signIn,
      createAccount,
      addBackupPasskey,
      confirmIdentity,
      endSession,
      clearError,
      signPayment,
      signRedeem,
      signAddDemoCard,
      signProfileUpdate,
      signWorkspace,
      signMerchantRule,
      signCreateCharge,
      confirmPasskey,
      signMerchantClaim,
      signProfile,
      signMerchantRegistration,
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
