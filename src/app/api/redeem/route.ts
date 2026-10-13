import { durableRelay } from "@/lib/server/durable-relay";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { reconcileRedemption } from "@/lib/server/redemptions";
import {
  encodeFunctionData,
  getAddress,
  isAddress,
  isHex,
  verifyTypedData,
} from "viem";
import type { RedeemResponse } from "@/lib/api/pay";
import {
  contractAddresses,
  redeemIntentTypes,
  rewAppPayAbi,
  rewAppPayDomain,
} from "@/lib/contracts";
import { publicClient } from "@/lib/server/chain";
import { assertRelayerFunded, getRelayer } from "@/lib/server/relayer";
import { RelayerOutOfGasError } from "@/lib/server/relayer-gas";
import { revertCode } from "@/lib/server/revert";

const fail = (error: string, status = 400) =>
  Response.json({ error }, { status });

type Fields = Record<string, unknown>;
type Body = {
  charge?: unknown;
  intent?: Fields;
  signature?: unknown;
  permit?: Fields;
};

const str = (value: unknown) => (typeof value === "string" ? value : "");

/** Birthday reward id (CUSTOMER, zero cost, once per year). See design.md. */
const BIRTHDAY_REWARD_ID = 90;

/** Raffle entry (CUSTOMER, app catalog). Draw and caps enforced off-chain. */
const RAFFLE_REWARD_ID = 201;
/** Max non-failed entries per account in the raffle. */
const RAFFLE_MAX_ENTRIES = 5;

function uint(value: unknown): bigint | undefined {
  if (typeof value !== "string" || !/^\d{1,78}$/.test(value)) return undefined;
  return BigInt(value);
}

/** Relays a signed RedeemIntent: spends RewPoints on a reward without MON. */
export async function POST(request: Request): Promise<Response> {
  const rewAppPay = contractAddresses.rewAppPay;
  if (!rewAppPay) return fail("not_configured", 503);

  const body = (await request.json().catch(() => null)) as Body | null;
  const raw = body?.intent;
  const rewardId = uint(raw?.rewardId);
  const nonce = uint(raw?.nonce);
  const deadline = uint(raw?.deadline);
  const signature = body?.signature;
  if (
    !isAddress(str(raw?.account)) ||
    rewardId === undefined ||
    nonce === undefined ||
    deadline === undefined ||
    !isHex(signature)
  ) {
    return fail("invalid_request");
  }
  const intent = {
    account: getAddress(str(raw?.account)),
    rewardId,
    nonce,
    deadline,
  };

  if (rewardId > 2147483647n) return fail("invalid_request");
  const reward = await db.platformReward.findUnique({
    where: { id: Number(rewardId) },
  });
  if (!reward || !reward.active) return fail("reward_unavailable");

  if (reward.audience === "COMMERCE") {
    const isMerchant = await publicClient
      .readContract({
        address: rewAppPay,
        abi: rewAppPayAbi,
        functionName: "isMerchant",
        args: [intent.account],
      })
      .catch(() => false);
    if (!isMerchant) return fail("reward_unavailable");
  } else if (reward.audience !== "CUSTOMER") return fail("reward_unavailable");

  const valid = await verifyTypedData({
    address: intent.account,
    domain: rewAppPayDomain(rewAppPay, publicClient.chain.id),
    types: redeemIntentTypes,
    primaryType: "RedeemIntent",
    message: intent,
    signature,
  }).catch(() => false);
  if (!valid) return fail("invalid_signature");

  const previous = await db.redemption.findUnique({
    where: {
      account_nonce: { account: intent.account, nonce: nonce.toString() },
    },
  });
  if (previous) {
    if (previous.rewardId !== Number(rewardId)) return fail("invalid_request");
    const item = await reconcileRedemption(previous.id);
    return Response.json(
      { txHash: item?.txHash, redemption: item },
      { status: item?.status === "PROCESSING" ? 202 : 200 },
    );
  }

  // Birthday reward (id 90): redeemable once per year. The points cost is
  // zero, so without this off-chain guard it could be farmed without limit.
  if (Number(rewardId) === BIRTHDAY_REWARD_ID) {
    const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const recent = await db.redemption.findFirst({
      where: {
        account: intent.account,
        rewardId: BIRTHDAY_REWARD_ID,
        createdAt: { gt: yearAgo },
        status: { not: "FAILED" },
      },
    });
    if (recent) return fail("birthday_already_redeemed", 409);
  }

  // Raffle entries (id 201): capped per account so a cheap entry cannot be
  // farmed without limit. Failed entries do not count toward the cap.
  if (Number(rewardId) === RAFFLE_REWARD_ID) {
    const entries = await db.redemption.count({
      where: {
        account: intent.account,
        rewardId: RAFFLE_REWARD_ID,
        status: { not: "FAILED" },
      },
    });
    if (entries >= RAFFLE_MAX_ENTRIES) return fail("raffle_limit_reached", 409);
  }

  // Sin combustible el relayer no puede liquidar: cortar acá deja un mensaje
  // humano en vez de dejar fallar la transacción y devolver un 502 opaco.
  try {
    await assertRelayerFunded();
  } catch (error) {
    if (error instanceof RelayerOutOfGasError)
      return fail("service_unavailable", 503);
    return fail("service_unavailable", 503);
  }

  const { account: relayer } = getRelayer();
  try {
    await publicClient.simulateContract({
      account: relayer,
      address: rewAppPay,
      abi: rewAppPayAbi,
      functionName: "redeemWithSig",
      args: [intent, signature],
    });
  } catch (error) {
    const code = revertCode(error);
    if (code) return fail(code);
    console.error("redeem simulation failed", error);
    return fail("relay_failed", 502);
  }

  const [pointsCost, audience, active, exists] =
    await publicClient.readContract({
      address: rewAppPay,
      abi: rewAppPayAbi,
      functionName: "rewards",
      args: [rewardId],
    });
  const expectedAudience = reward.audience === "COMMERCE" ? 1 : 0;
  if (
    !exists ||
    !active ||
    audience !== expectedAudience ||
    pointsCost > 2147483647n
  )
    return fail("reward_unavailable");
  let redemption;
  try {
    redemption = await db.redemption.create({
      data: {
        account: intent.account,
        nonce: nonce.toString(),
        rewardId: Number(rewardId),
        title: reward.title,
        pointsCost: Number(pointsCost),
        merchantId: reward.merchantId,
        pickupCode: randomBytes(12).toString("hex"),
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return fail("already_processing", 409);
    throw error;
  }
  try {
    const txHash = await durableRelay(
      rewAppPay,
      encodeFunctionData({
        abi: rewAppPayAbi,
        functionName: "redeemWithSig",
        args: [intent, signature],
      }),
      (hash) =>
        db.redemption.update({
          where: { id: redemption.id },
          data: { txHash: hash },
        }),
    );
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 30_000,
    });
    if (receipt.status !== "success") {
      await db.redemption.update({
        where: { id: redemption.id },
        data: {
          status: "FAILED",
          nonce: `${redemption.nonce}:failed:${redemption.id}`,
        },
      });
      return fail("relay_failed", 502);
    }
    const item = await reconcileRedemption(redemption.id);
    const response: RedeemResponse = { txHash, redemption: item };
    return Response.json(response);
  } catch (error) {
    console.error("redeem relay failed", error);
    const stored = await db.redemption.findUnique({
      where: { id: redemption.id },
    });
    if (!stored?.txHash) {
      await db.redemption.delete({ where: { id: redemption.id } });
      return fail("service_unavailable", 503);
    }
    return Response.json(
      {
        redemption: await db.redemption.findUnique({
          where: { id: redemption.id },
        }),
        pending: true,
      },
      { status: 202 },
    );
  }
}
