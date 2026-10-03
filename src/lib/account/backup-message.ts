import { keccak256, stringToBytes } from "viem";

// The account signs this to prove it owns the vault it stores.
function backupVaultMessage(credentialId: string, vaultJson: string): string {
  return [
    "RewApp: guardar passkey de respaldo",
    `credentialId: ${credentialId}`,
    `vault: ${keccak256(stringToBytes(vaultJson))}`,
  ].join("\n");
}

export { backupVaultMessage };
