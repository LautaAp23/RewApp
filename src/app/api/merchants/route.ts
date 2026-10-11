import { Prisma } from "@prisma/client";
import { getAddress, isAddress, isHex } from "viem";
import { verifySignedRequest } from "@/lib/api/signed-request";
import { merchantIntentTypes, merchantProfileTypes } from "@/lib/api/typed-data";
import { requireContractAddresses, rewAppPayAbi, rewAppPayDomain } from "@/lib/contracts";
import { db } from "@/lib/db";
import { type MerchantFormValues, validateMerchantForm } from "@/lib/merchant-form";
import { publicClient } from "@/lib/server/chain";
import { assertRelayerFunded, getRelayer, relay } from "@/lib/server/relayer";
import { RelayerOutOfGasError } from "@/lib/server/relayer-gas";

const fail = (error: string, status: number) => Response.json({ error }, { status });
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const uint = (value: unknown) =>
  typeof value === "string" && /^\d{1,20}$/.test(value) ? BigInt(value) : undefined;
const coord = (value: string) => (value === "" ? null : Number(value));

/**
 * Self-service merchant sign-up (docs/MODEL.md §6: nobody approves it).
 *
 * Two signatures, both produced by ONE fresh passkey confirmation: the profile
 * for us, and the MerchantIntent the contract verifies. The onchain relay runs
 * FIRST, so a failed transaction never leaves a row whose QR codes would revert
 * with NotMerchant. It is idempotent: an address already enabled onchain skips
 * the transaction, because the nonce check rejects replaying its signature.
 */
export async function POST(request: Request): Promise<Response> {
  const { rewAppPay } = requireContractAddresses();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const merchant = str(body?.merchant);
  const placeId = str(body?.placeId);
  const lat = str(body?.lat);
  const lng = str(body?.lng);
  const deadline = uint(body?.deadline);
  const nonce = uint(body?.nonce);
  const profileSignature = body?.profileSignature;
  const intentSignature = body?.intentSignature;
  if (
    !isAddress(merchant) ||
    deadline === undefined ||
    nonce === undefined ||
    !isHex(profileSignature) ||
    !isHex(intentSignature)
  ) {
    return fail("invalid_request", 400);
  }
  const values: MerchantFormValues = {
    name: str(body?.name),
    category: str(body?.category),
    city: str(body?.city),
    streetAddress: str(body?.streetAddress),
    country: str(body?.country).toUpperCase(),
    currency: str(body?.currency),
    email: str(body?.email),
  };
  if (Object.keys(validateMerchantForm(values)).length) return fail("invalid_request", 400);
  if ((lat === "") !== (lng === "")) return fail("invalid_request", 400);
  if (lat !== "" && (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)))) {
    return fail("invalid_request", 400);
  }
  const address = getAddress(merchant);

  // The profile signature: nothing else enforces its deadline, so fresh is true.
  const profileCheck = await verifySignedRequest({
    signer: address,
    types: merchantProfileTypes,
    primaryType: "MerchantProfile",
    message: { merchant: address, ...values, placeId, lat, lng, deadline },
    deadline,
    signature: profileSignature,
    fresh: true,
  });
  if (profileCheck === "expired_signature") return fail("expired_signature", 401);
  if (profileCheck !== "ok") return fail("invalid_signature", 401);

  // The intent signature: the contract checks this deadline itself, so fresh is false.
  const intentCheck = await verifySignedRequest({
    signer: address,
    types: merchantIntentTypes,
    primaryType: "MerchantIntent",
    message: { merchant: address, nonce, deadline },
    deadline,
    signature: intentSignature,
    fresh: false,
    domain: rewAppPayDomain(rewAppPay, publicClient.chain.id),
  });
  if (intentCheck !== "ok") return fail("invalid_signature", 401);

  // A person's identity must not become a merchant: its redemption audience
  // would flip (RewAppPay.sol:325). The spec says the server cannot tell the
  // two paths apart, but Postgres knows this address is already a person.
  const [person, existing] = await Promise.all([
    db.profile.findUnique({ where: { address } }),
    db.merchant.findUnique({ where: { address } }),
  ]);
  if (person) return fail("person_address", 409);
  if (existing) return fail("merchant_exists", 409);

  const enabled = await publicClient.readContract({
    address: rewAppPay,
    abi: rewAppPayAbi,
    functionName: "isMerchant",
    args: [address],
  });
  if (!enabled) {
    // Same guard /api/pay and /api/onramp use (phase 0): without fuel the relay
    // cannot enable the merchant, and a human message beats an opaque 502.
    try {
      await assertRelayerFunded();
    } catch (error) {
      if (error instanceof RelayerOutOfGasError) return fail("service_unavailable", 503);
      throw error;
    }
    try {
      const { account: relayer, wallet } = getRelayer();
      const { request: register } = await publicClient.simulateContract({
        account: relayer,
        address: rewAppPay,
        abi: rewAppPayAbi,
        functionName: "registerMerchantWithSig",
        args: [{ merchant: address, nonce, deadline }, intentSignature],
      });
      const txHash = await relay((next) => wallet.writeContract({ ...register, nonce: next }));
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 30_000 });
      if (receipt.status !== "success") throw new Error(`registerMerchantWithSig reverted: ${txHash}`);
    } catch (error) {
      console.error("merchant registration failed", error);
      return fail("activation_failed", 502);
    }
  }

  try {
    const row = await db.merchant.create({
      data: {
        address,
        name: values.name,
        category: values.category,
        city: values.city,
        streetAddress: values.streetAddress,
        country: values.country,
        currency: values.currency,
        email: values.email || null,
        placeId: placeId || null,
        lat: coord(lat),
        lng: coord(lng),
      },
    });
    return Response.json({ address: row.address, name: row.name }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("merchant_exists", 409);
    }
    throw error;
  }
}
