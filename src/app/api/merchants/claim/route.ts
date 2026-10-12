import { Prisma } from "@prisma/client";
import { getAddress, isAddress, isHex } from "viem";
import { db } from "@/lib/db";
import { isDerivationIndex } from "@/lib/merchant-index";
import { verifyOwnershipSignature } from "@/lib/server/merchant-owner";

const fail = (error: string, status: number) => Response.json({ error }, { status });

/**
 * Links a business that was registered before profiles owned their merchants.
 * Both keys of the same passkey sign the same message: the person, and the
 * merchant key at `derivationIndex`. A seeded demo cannot be claimed, because
 * the caller does not have its key.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const owner = typeof body?.owner === "string" ? body.owner : "";
  const merchant = typeof body?.merchant === "string" ? body.merchant : "";
  const derivationIndex =
    typeof body?.derivationIndex === "number"
      ? body.derivationIndex
      : typeof body?.derivationIndex === "string" && /^\d{1,2}$/.test(body.derivationIndex)
        ? Number(body.derivationIndex)
        : Number.NaN;
  let deadline: bigint;
  try {
    deadline = BigInt(String(body?.deadline));
  } catch {
    return fail("invalid_request", 400);
  }
  if (!isAddress(owner) || !isAddress(merchant) || !isDerivationIndex(derivationIndex) || !isHex(body?.ownershipSignature) || !isHex(body?.merchantSignature)) {
    return fail("invalid_request", 400);
  }
  const ownerAddress = getAddress(owner);
  const merchantAddress = getAddress(merchant);
  if (ownerAddress === merchantAddress) return fail("person_address", 409);

  const message = {
    signer: ownerAddress,
    owner: ownerAddress,
    merchant: merchantAddress,
    derivationIndex,
    deadline,
    signature: body?.ownershipSignature,
  };
  const personCheck = await verifyOwnershipSignature(message);
  if (personCheck === "expired_signature") return fail("expired_signature", 401);
  if (personCheck !== "ok") return fail("invalid_signature", 401);
  const merchantCheck = await verifyOwnershipSignature({ ...message, signer: merchantAddress, signature: body?.merchantSignature });
  if (merchantCheck !== "ok") return fail("invalid_signature", 401);

  const existing = await db.merchant.findUnique({ where: { address: merchantAddress } });
  if (!existing) return fail("not_merchant", 404);
  if (existing.ownerAddress && existing.ownerAddress !== ownerAddress) return fail("merchant_exists", 409);
  if (existing.ownerAddress === ownerAddress) {
    return Response.json({ address: existing.address, name: existing.name, derivationIndex: existing.derivationIndex });
  }

  try {
    const row = await db.merchant.update({
      where: { address: merchantAddress },
      data: { ownerAddress, derivationIndex },
    });
    return Response.json({ address: row.address, name: row.name, derivationIndex: row.derivationIndex });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("merchant_exists", 409);
    }
    throw error;
  }
}
