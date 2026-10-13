import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, type Address, type Log } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Prisma, type PersonalCharge } from "@prisma/client";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({ read: vi.fn(), receipt: vi.fn(), wait: vi.fn(), block: vi.fn(), simulate: vi.fn(), broadcast: vi.fn(), durable: vi.fn(), funded: vi.fn(), find: vi.fn(), update: vi.fn(), reserve: vi.fn(), profile: vi.fn(), transaction: vi.fn() }));
const token: Address = "0x3333333333333333333333333333333333333333", spender: Address = "0x4444444444444444444444444444444444444444", recipient: Address = "0x2222222222222222222222222222222222222222";
vi.mock("@/lib/contracts", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/contracts")>(), contractAddresses: { usdr: "0x3333333333333333333333333333333333333333" } }));
vi.mock("@/lib/db", () => ({ db: { personalCharge: { findUnique: mock.find, update: mock.update, updateMany: mock.reserve }, profile: { findUnique: mock.profile }, $transaction: mock.transaction } }));
vi.mock("./chain", () => ({ publicClient: { chain: { id: 10143 }, readContract: mock.read, getTransactionReceipt: mock.receipt, waitForTransactionReceipt: mock.wait, getBlock: mock.block, simulateContract: mock.simulate } }));
vi.mock("./relayer", () => ({ getRelayer: () => ({ account: { address: "0x4444444444444444444444444444444444444444" }, wallet: { sendRawTransaction: mock.broadcast } }), assertRelayerFunded: mock.funded }));
vi.mock("./durable-relay", () => ({ durableRelay: mock.durable }));
import { acceptPersonal, matchingPersonalTransfer, personalIntent, validatePersonalAuthorization } from "./personal-payments";
import { permitTypes, usdrAbi, usdrPermitDomain } from "../contracts";
import { personalPayTypes, type PersonalAuthorization } from "../personal-types";
import { rewAppApiDomain } from "../api/typed-data";
const payer = privateKeyToAccount(`0x${"11".repeat(32)}`);
const id = "12345678-1234-1234-1234-123456789abc", permitHash = `0x${"55".repeat(32)}`, txHash = `0x${"66".repeat(32)}`;
let row: PersonalCharge;
const log = (): Log => ({ address: token, blockHash: null, blockNumber: null, logIndex: null, transactionHash: null, transactionIndex: null, removed: false,
  topics: encodeEventTopics({ abi: usdrAbi, eventName: "Transfer", args: { from: payer.address, to: recipient } }) as Log["topics"], data: encodeAbiParameters([{ type: "uint256" }], [5000000n]) });
async function signed(): Promise<PersonalAuthorization> {
  const intent = { payer: payer.address, recipient, id, amount: 5000000n, spender, nonce: 0n, deadline: BigInt(Math.floor(Date.now() / 1000) + 300) };
  return { ...intent, amount: "5000000", nonce: "0", deadline: intent.deadline.toString(),
    signature: await payer.signTypedData({ domain: rewAppApiDomain(), types: personalPayTypes, primaryType: "PersonalPayment", message: intent }),
    permitSignature: await payer.signTypedData({ domain: usdrPermitDomain(token), types: permitTypes, primaryType: "Permit", message: { owner: payer.address, spender, value: intent.amount, nonce: intent.nonce, deadline: intent.deadline } }),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  row = { id, kind: "DIRECT", recipient, recipientName: "Ana", expectedPayer: payer.address, payer: null, usdAmount: 5000000n, status: "PENDING", expiresAt: new Date(Date.now() + 60000), permitHash: null, txHash: null, permitConfirmed: false, authorization: null } as PersonalCharge;
  mock.find.mockImplementation(async () => ({ ...row }));
  mock.update.mockImplementation(async ({ data }) => { Object.assign(row, data); return { ...row }; });
  mock.reserve.mockImplementation(async ({ data }) => { Object.assign(row, data); return { count: 1 }; });
  mock.profile.mockResolvedValue({ alias: "Santi" });
  mock.read.mockImplementation(async ({ functionName }) => functionName === "balanceOf" ? 10000000n : 0n);
  mock.block.mockResolvedValue({ timestamp: 1791849600n });
  mock.receipt.mockImplementation(async () => ({ status: "success", logs: [log()], blockHash: txHash }));
  mock.wait.mockResolvedValue({ status: "success" });
  mock.broadcast.mockResolvedValue(permitHash);
  mock.transaction.mockImplementation(async action => action({ $queryRaw: async () => [{ acquired: true }] }));
  mock.durable.mockImplementation(async (_token, _data, persist) => { const hash = row.permitHash ? txHash : permitHash; await persist(hash, "0x1234"); return hash; });
});
describe("personal payment authorization and durable execution", () => {
  it("verifies both real EIP-712 signatures and binds the account, recipient, amount, nonce and spender", async () => {
    const auth = await signed();
    await expect(validatePersonalAuthorization(auth, row)).resolves.toBeUndefined();
    for (const patch of [{ amount: "1" }, { recipient: token }, { spender: token }]) await expect(validatePersonalAuthorization({ ...auth, ...patch }, row)).rejects.toThrow("payment_mismatch");
    await expect(validatePersonalAuthorization({ ...auth, nonce: "1" }, row)).rejects.toThrow("invalid_signature");
    expect(personalIntent(auth).amount).toBe(5000000n);
  });
  it("rejects a different assigned payer, expired signature, stale permit nonce and insufficient funds", async () => {
    const auth = await signed();
    await expect(validatePersonalAuthorization(auth, { ...row, expectedPayer: token })).rejects.toThrow("payment_mismatch");
    await expect(validatePersonalAuthorization({ ...auth, deadline: "1" }, row)).rejects.toThrow("expired_signature");
    mock.read.mockResolvedValue(0n);
    await expect(validatePersonalAuthorization(auth, row)).rejects.toThrow("insufficient_funds");
    mock.read.mockImplementation(async ({ functionName }) => functionName === "balanceOf" ? 10000000n : 1n);
    await expect(validatePersonalAuthorization(auth, row)).rejects.toThrow("expired_signature");
  });
  it("settles only once and returns the same receipt on retry", async () => {
    const auth = await signed();
    expect((await acceptPersonal(auth))?.status).toBe("PAID");
    expect(row.payerLock).toBeNull();
    expect(mock.durable).toHaveBeenCalledTimes(2);
    expect((await acceptPersonal(auth))?.txHash).toBe(txHash);
    expect(mock.durable).toHaveBeenCalledTimes(2);
  });
  it("keeps the lock and resumes the exact signed transaction after a broadcast timeout", async () => {
    const auth = await signed();
    mock.durable.mockImplementationOnce(async (_token, _data, persist) => { await persist(permitHash, "0x1234"); throw new Error("timeout"); });
    await expect(acceptPersonal(auth)).rejects.toThrow("timeout");
    expect(row.status).toBe("PROCESSING"); expect(row.payerLock).toBe(payer.address);
    expect((await acceptPersonal(auth))?.status).toBe("PAID");
    expect(mock.broadcast).toHaveBeenCalledWith({ serializedTransaction: "0x1234" });
  });
  it("rejects a second active payment by the same payer before broadcasting", async () => {
    mock.reserve.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "6" }));
    await expect(acceptPersonal(await signed())).rejects.toThrow("payer_busy");
    expect(mock.durable).not.toHaveBeenCalled();
  });
  it("refuses to overwrite a transaction prepared by another execution", async () => {
    mock.reserve.mockImplementationOnce(async ({ data }) => { Object.assign(row, data); return { count: 1 }; });
    mock.reserve.mockImplementationOnce(async () => { row.permitHash = permitHash; return { count: 0 }; });
    await expect(acceptPersonal(await signed())).rejects.toThrow("already_processing");
    expect(mock.durable).toHaveBeenCalledOnce();
    expect(row.permitHash).toBe(permitHash);
    expect(row.status).toBe("PROCESSING");
  });
  it("does not generate a receipt from the wrong token, recipient, payer or amount", () => {
    const expected = { payer: payer.address, recipient, usdAmount: 5000000n };
    expect(matchingPersonalTransfer([log()], expected, token)).toBe(true);
    expect(matchingPersonalTransfer([log()], expected, spender)).toBe(false);
    for (const patch of [{ payer: token }, { recipient: token }, { usdAmount: 1n }]) expect(matchingPersonalTransfer([log()], { ...expected, ...patch }, token)).toBe(false);
  });
});
