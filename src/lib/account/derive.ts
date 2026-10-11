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

type AccountRole = "person" | "merchant";

// One passkey, two identities. The person's path is the ORIGINAL one and must
// never change: every existing account derives from it (see derive.test.ts).
// The merchant path is additive, so no existing address moves.
const ACCOUNT_PATHS: Record<AccountRole, string> = {
  person: "m/44'/60'/0'/0/0",
  merchant: "m/44'/60'/0'/0/1",
};

// The account entropy is the primary passkey's PRF output. Changing this
// mapping changes every account address, so it must stay fixed.
function accountFromEntropy(entropy: Uint8Array, role: AccountRole = "person"): PasskeyAccount {
  const seed = mnemonicToSeedSync(entropyToMnemonic(entropy, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(ACCOUNT_PATHS[role]);
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

/**
 * Address of one of the two identities, with no live signing session: role
 * discovery only needs the address. Zeroes the entropy it was given.
 */
function addressFromEntropy(entropy: Uint8Array, role: AccountRole): EvmAddress {
  const account = accountFromEntropy(entropy, role);
  try {
    return account.address;
  } finally {
    account.session.end();
    entropy.fill(0);
  }
}

// Passkeys are bound to the rpId, so production pins it to the fixed domain.
function getRpId(): string {
  const configured = process.env.NEXT_PUBLIC_RP_ID;
  return configured && location.hostname === configured
    ? configured
    : location.hostname;
}

export { accountFromEntropy, addressFromEntropy, getRpId };
export type { AccountRole, PasskeyAccount };
