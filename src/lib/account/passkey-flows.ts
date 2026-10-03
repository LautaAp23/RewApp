import {
  createPasskeyWithPrfOutput,
  createSecretVaultWithNewPasskey,
  decryptSecretVaultWithPasskey,
  getPasskeyPrfOutput,
  parseSecretVault,
  type PasskeySecretVault,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { backupVaultMessage } from "./backup-message";
import { accountFromEntropy } from "./derive";
import { AccountError } from "./errors";

type PasskeyKind = "principal" | "respaldo";

type AccountEntropy = {
  entropy: Uint8Array;
  credentialId: string;
  kind: PasskeyKind;
};

const RP_NAME = "RewApp";

function backupVaultError(status: number): AccountError {
  return new AccountError(
    "BACKUP_VAULT_REQUEST_FAILED",
    `backup-vaults: ${status}`,
  );
}

/**
 * Runs the sign-in ceremony with any RewApp passkey and returns the account
 * entropy. A primary passkey takes one prompt; a backup passkey takes a
 * second one to decrypt its vault, because the vault uses its own PRF salt.
 */
async function getAccountEntropy(rpId: string): Promise<AccountEntropy> {
  const { credentialId, prfOutput } = await getPasskeyPrfOutput({ rpId });
  let response: Response;
  try {
    response = await fetch(
      `/api/backup-vaults/${encodeURIComponent(credentialId)}`,
    );
  } catch (error) {
    prfOutput.fill(0);
    throw error;
  }
  if (response.status === 404) {
    return { entropy: prfOutput, credentialId, kind: "principal" };
  }
  prfOutput.fill(0);
  if (!response.ok) throw backupVaultError(response.status);

  const { vault } = (await response.json()) as { vault: unknown };
  const entropy = await decryptSecretVaultWithPasskey({
    rpId,
    vault: parseSecretVault(vault),
  });
  return { entropy, credentialId, kind: "respaldo" };
}

async function createAccountPasskey(rpId: string): Promise<AccountEntropy> {
  const created = await createPasskeyWithPrfOutput({
    rp: { id: rpId, name: RP_NAME },
    user: { name: "RewApp", displayName: "RewApp" },
  });
  return {
    entropy: created.prfOutput,
    credentialId: created.credentialId,
    kind: "principal",
  };
}

/**
 * Creates a backup passkey that opens the same account: the account entropy
 * is encrypted into a Mera secret vault and stored by the backend, signed by
 * the account so the backend can check the address.
 */
async function addBackupPasskey(
  rpId: string,
  entropy: Uint8Array,
): Promise<PasskeySecretVault> {
  const account = accountFromEntropy(entropy);
  try {
    const vault = await createSecretVaultWithNewPasskey({
      rp: { id: rpId, name: RP_NAME },
      user: { name: "RewApp", displayName: "RewApp (respaldo)" },
      secret: entropy,
    });
    const vaultJson = JSON.stringify(vault);
    const signature = await toViemAccount(account.session).signMessage({
      message: backupVaultMessage(vault.credential.credentialId, vaultJson),
    });
    const response = await fetch("/api/backup-vaults", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountAddress: account.address,
        vaultJson,
        signature,
      }),
    });
    if (!response.ok) throw backupVaultError(response.status);
    return vault;
  } finally {
    account.session.end();
  }
}

export { addBackupPasskey, createAccountPasskey, getAccountEntropy };
export type { AccountEntropy, PasskeyKind };
