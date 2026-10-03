import { isMeraError, parseSecretVault } from "@category-labs/mera";
import { Prisma } from "@prisma/client";
import { isAddress, isHex, verifyMessage } from "viem";
import { backupVaultMessage } from "@/lib/account/backup-message";
import { db } from "@/lib/db";

type Body = {
  accountAddress?: unknown;
  vaultJson?: unknown;
  signature?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const { accountAddress, vaultJson, signature } = (await request
    .json()
    .catch(() => ({}))) as Body;
  if (
    typeof accountAddress !== "string" ||
    !isAddress(accountAddress) ||
    typeof vaultJson !== "string" ||
    typeof signature !== "string" ||
    !isHex(signature)
  ) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  let vault;
  try {
    vault = parseSecretVault(JSON.parse(vaultJson));
  } catch (error) {
    if (error instanceof SyntaxError || isMeraError(error)) {
      return Response.json({ error: "invalid_vault" }, { status: 400 });
    }
    throw error;
  }
  const { credentialId } = vault.credential;

  const signedByAccount = await verifyMessage({
    address: accountAddress,
    message: backupVaultMessage(credentialId, vaultJson),
    signature,
  });
  if (!signedByAccount) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  try {
    await db.backupVault.create({
      data: { credentialId, accountAddress, vault },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json({ error: "vault_exists" }, { status: 409 });
    }
    throw error;
  }
  return Response.json({ credentialId }, { status: 201 });
}
