import { type Address, verifyTypedData } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  paymentIntentTypes,
  permitTypes,
  type PaymentIntent,
  type RedeemIntent,
  redeemIntentTypes,
  rewAppPayDomain,
  usdrPermitDomain,
} from "../contracts/eip712";
import {
  createSessionPolicy,
  NeedsConfirmation,
  PolicyRejection,
  type SessionPolicyConfig,
  type SpendLedger,
} from "./session-policy";

const USD = 1_000_000n;
const MINUTE = 60_000;
const rewAppPay = "0xC1FECE4894229A6A39973163e5D000A1949a1898" as Address;
const usdr = "0xEDE21153D3675B8583A3622a071C7821C5aF8670" as Address;
const merchant = "0x52576f0fECBE8E68f830DB256411201bAdA49EeA" as Address;
const chainId = 10143;

function setup(overrides: Partial<SessionPolicyConfig> = {}) {
  const clock = { now: Date.UTC(2026, 9, 5, 12) };
  const signer = privateKeyToAccount(generatePrivateKey());
  const policy = createSessionPolicy(signer, {
    rewAppPay,
    usdr,
    chainId,
    now: () => clock.now,
    ...overrides,
  });
  let nonce = 0n;
  const payment = (amount: bigint, extra: Partial<PaymentIntent> = {}) => ({
    payer: signer.address,
    merchant,
    amount,
    chargeId: `0x${"ab".repeat(32)}` as const,
    nonce: nonce++,
    deadline: BigInt(Math.floor(clock.now / 1000) + 600),
    ...extra,
  });
  const redeem = (extra: Partial<RedeemIntent> = {}): RedeemIntent => ({
    account: signer.address,
    rewardId: 1n,
    nonce: nonce++,
    deadline: BigInt(Math.floor(clock.now / 1000) + 600),
    ...extra,
  });
  return { clock, signer, policy, payment, redeem };
}

async function expectNeedsConfirmation(promise: Promise<unknown>, reason: string) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(NeedsConfirmation);
  expect((error as NeedsConfirmation).reason).toBe(reason);
}

async function expectRejection(promise: Promise<unknown>, reason: string) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(PolicyRejection);
  expect((error as PolicyRejection).reason).toBe(reason);
}

describe("session policy (T5)", () => {
  it("signs three payments in a row without a prompt", async () => {
    const { policy, payment } = setup();
    for (let i = 0; i < 3; i++) {
      await expect(policy.signPayment(payment(20n * USD), BigInt(i))).resolves.toBeDefined();
    }
  });

  it("asks for confirmation above the per-payment limit and signs once confirmed", async () => {
    const { policy, payment, signer } = setup();
    expect(policy.checkScope(25n * USD)).toBe("over-payment-limit");
    const intent = payment(25n * USD);
    await expectNeedsConfirmation(policy.signPayment(intent, 0n), "over-payment-limit");
    await expect(policy.signPayment(intent, 0n, { confirmedBy: signer })).resolves.toBeDefined();
  });

  it("asks for confirmation once the daily limit is reached, and resets the next UTC day", async () => {
    const { policy, payment, clock } = setup({ idleMs: 2 * 24 * 60 * MINUTE });
    for (let i = 0; i < 5; i++) await policy.signPayment(payment(20n * USD), BigInt(i));
    await expectNeedsConfirmation(policy.signPayment(payment(1n * USD), 5n), "over-daily-limit");
    clock.now += 24 * 60 * MINUTE;
    await expect(policy.signPayment(payment(1n * USD), 5n)).resolves.toBeDefined();
  });

  it("keeps the daily spend across sessions sharing a ledger", async () => {
    const ledger: SpendLedger = { day: 0, spent: 0n };
    const first = setup({ ledger });
    for (let i = 0; i < 5; i++) await first.policy.signPayment(first.payment(20n * USD), BigInt(i));
    const second = setup({ ledger });
    expect(second.policy.checkScope(1n * USD)).toBe("over-daily-limit");
  });

  it("expires after 15 minutes without activity and stays expired", async () => {
    const { policy, payment, redeem, clock } = setup();
    clock.now += 15 * MINUTE + 1;
    expect(policy.isExpired()).toBe(true);
    policy.touch();
    await expectNeedsConfirmation(policy.signPayment(payment(1n * USD), 0n), "expired");
    await expectNeedsConfirmation(policy.signRedeem(redeem()), "expired");
  });

  it("activity postpones the expiry", () => {
    const { policy, clock } = setup();
    clock.now += 10 * MINUTE;
    policy.touch();
    clock.now += 10 * MINUTE;
    expect(policy.isExpired()).toBe(false);
  });

  it("a confirmation renews an expired session", async () => {
    const { policy, payment, clock, signer } = setup();
    clock.now += 16 * MINUTE;
    await policy.signPayment(payment(1n * USD), 0n, { confirmedBy: signer });
    expect(policy.isExpired()).toBe(false);
    await expect(policy.signPayment(payment(1n * USD), 1n)).resolves.toBeDefined();
  });
});

describe("only RewAppPay intents are signed", () => {
  it("signs a PaymentIntent and a USDr permit for exactly that amount to RewAppPay", async () => {
    const { policy, payment, signer } = setup();
    const intent = payment(10n * USD);
    const signed = await policy.signPayment(intent, 7n);

    await expect(
      verifyTypedData({
        address: signer.address,
        domain: rewAppPayDomain(rewAppPay, chainId),
        types: paymentIntentTypes,
        primaryType: "PaymentIntent",
        message: intent,
        signature: signed.signature,
      }),
    ).resolves.toBe(true);

    const { v, r, s } = signed.permit;
    expect(signed.permit.value).toBe(intent.amount);
    expect(signed.permit.deadline).toBe(intent.deadline);
    await expect(
      verifyTypedData({
        address: signer.address,
        domain: usdrPermitDomain(usdr, chainId),
        types: permitTypes,
        primaryType: "Permit",
        message: {
          owner: signer.address,
          spender: rewAppPay,
          value: intent.amount,
          nonce: 7n,
          deadline: intent.deadline,
        },
        signature: `${r}${s.slice(2)}${v.toString(16)}`,
      }),
    ).resolves.toBe(true);
  });

  it("signs a RedeemIntent", async () => {
    const { policy, redeem, signer } = setup();
    const intent = redeem();
    const { signature } = await policy.signRedeem(intent);
    await expect(
      verifyTypedData({
        address: signer.address,
        domain: rewAppPayDomain(rewAppPay, chainId),
        types: redeemIntentTypes,
        primaryType: "RedeemIntent",
        message: intent,
        signature,
      }),
    ).resolves.toBe(true);
  });

  it("exposes no generic signing", () => {
    const { policy } = setup();
    expect(Object.keys(policy).sort()).toEqual(
      ["address", "checkScope", "end", "isExpired", "signPayment", "signRedeem", "touch"].sort(),
    );
  });

  it("rejects intents for another account, even when confirmed", async () => {
    const { policy, payment, redeem, signer } = setup();
    const other = privateKeyToAccount(generatePrivateKey());
    await expectRejection(policy.signPayment(payment(1n * USD, { payer: other.address }), 0n), "wrong-account");
    await expectRejection(
      policy.signPayment(payment(1n * USD, { payer: other.address }), 0n, { confirmedBy: signer }),
      "wrong-account",
    );
    await expectRejection(policy.signRedeem(redeem({ account: other.address })), "wrong-account");
    await expectRejection(policy.signPayment(payment(25n * USD), 0n, { confirmedBy: other }), "wrong-account");
  });

  it("rejects zero amounts and expired or long-lived deadlines", async () => {
    const { policy, payment, clock } = setup();
    const nowSeconds = BigInt(Math.floor(clock.now / 1000));
    await expectRejection(policy.signPayment(payment(0n), 0n), "invalid-amount");
    await expectRejection(policy.signPayment(payment(1n * USD, { deadline: nowSeconds }), 0n), "invalid-deadline");
    await expectRejection(
      policy.signPayment(payment(1n * USD, { deadline: nowSeconds + 31n * 60n }), 0n),
      "invalid-deadline",
    );
  });

  it("refuses to sign after the session ended", async () => {
    const { policy, payment } = setup();
    policy.end();
    await expectRejection(policy.signPayment(payment(1n * USD), 0n), "ended");
  });
});
