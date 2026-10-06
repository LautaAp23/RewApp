import { type Address, type Hex, type LocalAccount, parseSignature } from "viem";
import {
  type PaymentIntent,
  paymentIntentTypes,
  permitTypes,
  type RedeemIntent,
  redeemIntentTypes,
  rewAppPayDomain,
  usdrPermitDomain,
} from "../contracts/eip712";

/** docs/PLAN.md §4.3. Amounts are USDr base units (6 decimals). */
const SESSION_IDLE_MS = 15 * 60 * 1000;
const SESSION_MAX_PAYMENT = 20_000_000n;
const SESSION_DAILY_LIMIT = 100_000_000n;
/** Signed intents and permits must expire soon: no long-lived signatures. */
const MAX_DEADLINE_SECONDS = 30 * 60;

/** Amount signed on one UTC day; shared across sessions so a new one cannot reset it. */
type SpendLedger = { day: number; spent: bigint };

type SessionPolicyConfig = {
  rewAppPay: Address;
  usdr: Address;
  chainId: number;
  maxPayment?: bigint;
  dailyLimit?: bigint;
  idleMs?: number;
  ledger?: SpendLedger;
  now?: () => number;
};

/** Out of the session scope: allowed only after the user confirms with the passkey. */
type ScopeReason = "expired" | "over-payment-limit" | "over-daily-limit";

/** Never signed, even after a confirmation. */
type RejectReason =
  | "wrong-account"
  | "invalid-amount"
  | "invalid-deadline"
  | "ended";

class NeedsConfirmation extends Error {
  readonly reason: ScopeReason;

  constructor(reason: ScopeReason) {
    super(`session policy: ${reason}`);
    this.name = "NeedsConfirmation";
    this.reason = reason;
  }
}

class PolicyRejection extends Error {
  readonly reason: RejectReason;

  constructor(reason: RejectReason) {
    super(`session policy: ${reason}`);
    this.name = "PolicyRejection";
    this.reason = reason;
  }
}

type PermitData = { value: bigint; deadline: bigint; v: number; r: Hex; s: Hex };

type SignedPayment = {
  intent: PaymentIntent;
  signature: Hex;
  /** USDr permit for exactly `intent.amount`, spendable only by RewAppPay. */
  permit: PermitData;
};

type SignedRedeem = { intent: RedeemIntent; signature: Hex };

type SignOptions = {
  /**
   * Account rebuilt from a fresh passkey prompt. Lets one action go beyond the
   * session scope; the session key alone never can.
   */
  confirmedBy?: LocalAccount;
};

type SessionPolicy = {
  readonly address: Address;
  /** Why the next action of this amount needs a passkey prompt, if it does. */
  checkScope(amount?: bigint): ScopeReason | undefined;
  isExpired(): boolean;
  /** User activity in the app: postpones the idle expiry unless already expired. */
  touch(): void;
  signPayment(
    intent: PaymentIntent,
    permitNonce: bigint,
    options?: SignOptions,
  ): Promise<SignedPayment>;
  signRedeem(intent: RedeemIntent, options?: SignOptions): Promise<SignedRedeem>;
  end(): void;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Wraps the in-memory Mera signer so the session can only sign RewAppPay
 * PaymentIntent (+ its USDr permit) and RedeemIntent typed data, within the
 * per-payment and daily limits, until 15 minutes without activity. There is
 * no generic sign method: any other signature is impossible by construction.
 */
function createSessionPolicy(
  signer: LocalAccount,
  config: SessionPolicyConfig,
): SessionPolicy {
  const now = config.now ?? Date.now;
  const maxPayment = config.maxPayment ?? SESSION_MAX_PAYMENT;
  const dailyLimit = config.dailyLimit ?? SESSION_DAILY_LIMIT;
  const idleMs = config.idleMs ?? SESSION_IDLE_MS;
  const payDomain = rewAppPayDomain(config.rewAppPay, config.chainId);
  const permitDomain = usdrPermitDomain(config.usdr, config.chainId);

  let lastActivity = now();
  let expired = false;
  let ended = false;
  const ledger = config.ledger ?? { day: Math.floor(now() / DAY_MS), spent: 0n };

  function isExpired() {
    if (!expired && now() - lastActivity > idleMs) expired = true;
    return expired;
  }

  function spentToday() {
    const day = Math.floor(now() / DAY_MS);
    if (day !== ledger.day) {
      ledger.day = day;
      ledger.spent = 0n;
    }
    return ledger.spent;
  }

  function checkScope(amount = 0n): ScopeReason | undefined {
    if (isExpired()) return "expired";
    if (amount > maxPayment) return "over-payment-limit";
    if (spentToday() + amount > dailyLimit) return "over-daily-limit";
    return undefined;
  }

  function pickSigner(account: Address, deadline: bigint, options?: SignOptions) {
    if (ended) throw new PolicyRejection("ended");
    if (account.toLowerCase() !== signer.address.toLowerCase()) {
      throw new PolicyRejection("wrong-account");
    }
    const confirmed = options?.confirmedBy;
    if (
      confirmed &&
      confirmed.address.toLowerCase() !== signer.address.toLowerCase()
    ) {
      throw new PolicyRejection("wrong-account");
    }
    const nowSeconds = BigInt(Math.floor(now() / 1000));
    if (deadline <= nowSeconds || deadline > nowSeconds + BigInt(MAX_DEADLINE_SECONDS)) {
      throw new PolicyRejection("invalid-deadline");
    }
    return confirmed;
  }

  function markActivity(confirmed: boolean) {
    // A confirmation proves the user is present, so it also renews the session.
    if (confirmed) expired = false;
    lastActivity = now();
  }

  return {
    address: signer.address,
    checkScope,
    isExpired,

    touch() {
      if (!isExpired()) lastActivity = now();
    },

    async signPayment(intent, permitNonce, options) {
      const confirmed = pickSigner(intent.payer, intent.deadline, options);
      if (intent.amount <= 0n) throw new PolicyRejection("invalid-amount");
      const reason = checkScope(intent.amount);
      if (reason && !confirmed) throw new NeedsConfirmation(reason);

      const account = confirmed ?? signer;
      const signature = await account.signTypedData({
        domain: payDomain,
        types: paymentIntentTypes,
        primaryType: "PaymentIntent",
        message: intent,
      });
      const permitSignature = await account.signTypedData({
        domain: permitDomain,
        types: permitTypes,
        primaryType: "Permit",
        message: {
          owner: intent.payer,
          spender: config.rewAppPay,
          value: intent.amount,
          nonce: permitNonce,
          deadline: intent.deadline,
        },
      });
      ledger.spent = spentToday() + intent.amount;
      markActivity(Boolean(confirmed));

      const { r, s, v, yParity } = parseSignature(permitSignature);
      return {
        intent,
        signature,
        permit: {
          value: intent.amount,
          deadline: intent.deadline,
          v: v !== undefined ? Number(v) : yParity + 27,
          r,
          s,
        },
      };
    },

    async signRedeem(intent, options) {
      const confirmed = pickSigner(intent.account, intent.deadline, options);
      const reason = checkScope();
      if (reason && !confirmed) throw new NeedsConfirmation(reason);

      const signature = await (confirmed ?? signer).signTypedData({
        domain: payDomain,
        types: redeemIntentTypes,
        primaryType: "RedeemIntent",
        message: intent,
      });
      markActivity(Boolean(confirmed));
      return { intent, signature };
    },

    end() {
      ended = true;
    },
  };
}

export {
  createSessionPolicy,
  MAX_DEADLINE_SECONDS,
  NeedsConfirmation,
  PolicyRejection,
  SESSION_DAILY_LIMIT,
  SESSION_IDLE_MS,
  SESSION_MAX_PAYMENT,
};
export type {
  PermitData,
  RejectReason,
  ScopeReason,
  SessionPolicy,
  SessionPolicyConfig,
  SignedPayment,
  SignedRedeem,
  SignOptions,
  SpendLedger,
};
