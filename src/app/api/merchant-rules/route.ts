import { workspaceAccount } from "@/lib/server/workspace-auth";
import { getAddress, isAddress, isHex, verifyTypedData } from "viem";
import { db } from "@/lib/db";
import {
  contractAddresses,
  rewAppPayAbi,
  rewAppPayDomain,
  ruleIntentTypes,
  type RuleIntent,
} from "@/lib/contracts";
import { publicClient } from "@/lib/server/chain";
import { assertRelayerFunded, getRelayer, relay } from "@/lib/server/relayer";
import { isFreshDeadline } from "@/lib/api/typed-data";
const fail = (error: string, status = 400) =>
  Response.json({ error }, { status });
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const raw = body?.intent;
  if (
    !raw ||
    !isAddress(raw.merchant) ||
    !isHex(body.signature) ||
    ![0, 1].includes(raw.ruleType) ||
    typeof raw.active !== "boolean" ||
    !Number.isInteger(raw.valueBps) ||
    raw.valueBps < 0 ||
    raw.valueBps > 5000 ||
    !Number.isSafeInteger(raw.visitsGoal) ||
    raw.visitsGoal < 0 ||
    raw.visitsGoal > 10000 ||
    [raw.minAmount, raw.fixedAmount, raw.nonce, raw.deadline].some(
      (v) => typeof v !== "string" || !/^\d{1,78}$/.test(v),
    )
  )
    return fail("invalid_request");
  const intent: RuleIntent = {
    ...raw,
    merchant: getAddress(raw.merchant),
    minAmount: BigInt(raw.minAmount),
    fixedAmount: BigInt(raw.fixedAmount),
    nonce: BigInt(raw.nonce),
    deadline: BigInt(raw.deadline),
  };
  if (
    !isFreshDeadline(intent.deadline) ||
    (intent.ruleType === 1 && intent.active && intent.visitsGoal === 0)
  )
    return fail("invalid_request");
  const address = contractAddresses.rewAppPay;
  if (!address) return fail("not_configured", 503);
  if (!(await db.merchant.findUnique({ where: { address: intent.merchant } })))
    return fail("not_merchant", 403);
  const valid = await verifyTypedData({
    address: intent.merchant,
    domain: rewAppPayDomain(address, publicClient.chain.id),
    types: ruleIntentTypes,
    primaryType: "RuleIntent",
    message: intent,
    signature: body.signature,
  }).catch(() => false);
  if (!valid) return fail("invalid_signature", 401);
  try {
    await assertRelayerFunded();
    const { account, wallet } = getRelayer();
    const simulation = await publicClient.simulateContract({
      address,
      abi: rewAppPayAbi,
      functionName: "setMerchantRuleWithSig",
      account,
      args: [intent, body.signature],
    });
    const txHash = await relay((nonce) =>
      wallet.writeContract({ ...simulation.request, nonce }),
    );
    const receipt = await publicClient
      .waitForTransactionReceipt({ hash: txHash, timeout: 30_000 })
      .catch(() => null);
    return Response.json(
      { txHash, status: receipt ? receipt.status : "pending" },
      { status: receipt ? 200 : 202 },
    );
  } catch {
    return fail("service_unavailable", 503);
  }
}

export async function GET(request: Request) {
  const account = await workspaceAccount(),
    address = contractAddresses.rewAppPay;
  const merchant = new URL(request.url).searchParams.get("merchant");
  if (!account || !address || !merchant || !isAddress(merchant)) return fail("unauthorized", 401);
  const row = await db.merchant.findFirst({
    where: {
      address: getAddress(merchant),
      OR: [{ ownerAddress: account }, { address: account }],
    },
  });
  if (!row) return fail("not_merchant", 403);
  try {
    const rules = await Promise.all(
      ([0, 1] as const).map(async (type) => {
        const [minAmount, fixedAmount, valueBps, visitsGoal, active] =
          await publicClient.readContract({
            address,
            abi: rewAppPayAbi,
            functionName: "rules",
            args: [getAddress(merchant), type],
          });
        return {
          minimum: `${minAmount / 1000000n}.${(minAmount % 1000000n).toString().padStart(6, "0")}`,
          valueBps,
          fixedAmount: fixedAmount.toString(),
          visitsGoal,
          active,
        };
      }),
    );
    return Response.json(
      { rules },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return fail("service_unavailable", 503);
  }
}
