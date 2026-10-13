import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, type Log, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chargeIdToBytes32, rewAppPayAbi, usdrAbi } from "../contracts";
import { receiptSettlement, receiptTopUp, receiptHref, isReceiptKind } from "./receipt";
import { viewReceiptTypes, rewAppApiDomain } from "./typed-data";
import { verifySignedRequest } from "./signed-request";

const payer = privateKeyToAccount(`0x${"11".repeat(32)}`);
const merchant = `0x${"22".repeat(20)}` as Address;
const contract = `0x${"33".repeat(20)}` as Address;
const expected = { contract, id: "receipt-test", payer: payer.address, merchant, amount: 5_000_000n };
const log: Log = {
  address: contract, blockHash: null, blockNumber: null, logIndex: null, transactionHash: null, transactionIndex: null, removed: false,
  topics: encodeEventTopics({ abi: rewAppPayAbi, eventName: "PaymentSettled", args: { payer: payer.address, merchant, chargeId: chargeIdToBytes32(expected.id) } }) as Log["topics"],
  data: encodeAbiParameters(Array.from({ length: 6 }, () => ({ type: "uint256" })), [5_000_000n, 4_425_000n, 75_000n, 500_000n, 50n, 50n]),
};

describe("confirmed payment receipts", () => {
  it("extracts the actual rewards from the matching payment event", () => {
    const settled = receiptSettlement([log], expected);
    expect(settled?.args.customerPointsEarned).toBe(50n);
    expect(settled?.args.merchantReward).toBe(500_000n);
  });
  it("rejects events from a different charge, contract, payer, merchant or amount", () => {
    expect(receiptSettlement([], expected)).toBeUndefined();
    expect(receiptSettlement([{ ...log, address: merchant }], expected)).toBeUndefined();
    for (const patch of [{ id: "another-charge" }, { payer: merchant }, { merchant: contract }, { amount: 1n }]) {
      expect(receiptSettlement([log], { ...expected, ...patch })).toBeUndefined();
    }
  });
  it("binds the receipt authorization to the owner, charge and expiration", async () => {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60);
    const message = { account: payer.address, operation: expected.id, kind: "payment", deadline };
    const signature = await payer.signTypedData({ domain: rewAppApiDomain(), types: viewReceiptTypes, primaryType: "ViewReceipt", message });
    const params = { signer: payer.address, types: viewReceiptTypes, primaryType: "ViewReceipt", message, deadline, signature, fresh: true };
    expect(await verifySignedRequest(params)).toBe("ok");
    expect(await verifySignedRequest({ ...params, message: { ...message, operation: "another-charge" } })).toBe("invalid_signature");
    expect(await verifySignedRequest({ ...params, message: { ...message, kind: "topup" } })).toBe("invalid_signature");
    expect(await verifySignedRequest({ ...params, signer: merchant })).toBe("invalid_signature");
    expect(await verifySignedRequest({ ...params, deadline: 1n })).toBe("expired_signature");
  });

  it("requires a matching token mint for top-up receipts", () => {
    const mint: Log = { ...log, address: contract,
      topics: encodeEventTopics({ abi: usdrAbi, eventName: "Transfer", args: { from: "0x0000000000000000000000000000000000000000", to: payer.address } }) as Log["topics"],
      data: encodeAbiParameters([{ type: "uint256" }], [5_000_000n]) };
    const target = { token: contract, account: payer.address, amount: 5_000_000n };
    expect(receiptTopUp([mint], target)).toBeDefined();
    expect(receiptTopUp([mint], { ...target, amount: 1n })).toBeUndefined();
    expect(receiptTopUp([mint], { ...target, token: merchant })).toBeUndefined();
    expect(receiptTopUp([mint], { ...target, account: merchant })).toBeUndefined();
    const transfer = { ...mint, topics: encodeEventTopics({ abi: usdrAbi, eventName: "Transfer", args: { from: merchant, to: payer.address } }) as Log["topics"] };
    expect(receiptTopUp([transfer], target)).toBeUndefined();
  });
  it("separates payment and top-up receipt routes and rejects unknown operation kinds", () => {
    expect(receiptHref("payment", "abc")).toBe("/comprobante/abc?tipo=payment");
    expect(receiptHref("topup", "abc")).toBe("/comprobante/abc?tipo=topup");
    expect(isReceiptKind("topup")).toBe(true);
    expect(isReceiptKind("untrusted")).toBe(false);
  });
});
