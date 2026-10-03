import {
  createSecp256k1SigningSession,
  type EvmAddress,
  getEvmAddress,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

type PasskeyAccount = {
  session: Secp256k1SigningSession;
  address: EvmAddress;
};

const EVM_ACCOUNT_PATH = "m/44'/60'/0'/0/0";

// The account entropy is the primary passkey's PRF output. Changing this
// mapping changes every account address, so it must stay fixed.
function accountFromEntropy(entropy: Uint8Array): PasskeyAccount {
  const seed = mnemonicToSeedSync(entropyToMnemonic(entropy, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(EVM_ACCOUNT_PATH);
  try {
    if (!node.privateKey) throw new Error("La derivación no produjo clave");
    const session = createSecp256k1SigningSession({
      privateKey: node.privateKey,
    });
    return { session, address: getEvmAddress(session.publicKey) };
  } finally {
    seed.fill(0);
    node.wipePrivateData();
  }
}

// Passkeys are bound to the rpId, so production pins it to the fixed domain.
function getRpId(): string {
  const configured = process.env.NEXT_PUBLIC_RP_ID;
  return configured && location.hostname === configured
    ? configured
    : location.hostname;
}

export { accountFromEntropy, getRpId };
export type { PasskeyAccount };
