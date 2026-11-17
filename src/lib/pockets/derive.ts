/**
 * Seed → trading pockets.
 *
 * Whatever the source (HME Wallet, HME Vault, a seed the person types, or a
 * Seeds operator seed), Seeds only ever keeps the pocket branches derived
 * here — never the seed itself and never the savings branch (account 0).
 * The output has exactly the shape an HME Wallet "instant access" link sends
 * (xpubs + sealed xprvs per path), so both sources feed the same storage.
 */
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58, hex } from "@scure/base";
import { POCKET_COINS, accountPath, validPocket, type PocketCoin } from "./coins";
import { addressFor } from "./encode";
import { slip10Ed25519 } from "./slip10";

export type PocketBundle = {
  account: number;
  paths: string[];
  /** secp256k1: account xpub. SOL: base58 public key (no xpub exists for ed25519). */
  xpubs: Partial<Record<PocketCoin, string>>;
  /** secp256k1: account xprv. SOL: hex 32-byte SLIP-0010 private key. Secret. */
  xprvs: Partial<Record<PocketCoin, string>>;
  addresses: Partial<Record<PocketCoin, string>>;
};

export function normalizeMnemonic(words: string): string {
  return words.normalize("NFKD").trim().toLowerCase().split(/\s+/).join(" ");
}

export function pocketsFromMnemonic(
  words: string,
  opts: { account?: number; passphrase?: string; coins?: readonly PocketCoin[] } = {},
): PocketBundle {
  const account = opts.account ?? 1106;
  if (!validPocket(account)) throw new Error("Pocket number must be 1106–2105");
  const phrase = normalizeMnemonic(words);
  if (!validateMnemonic(phrase, wordlist)) throw new Error("That recovery phrase isn't valid");
  const seed = mnemonicToSeedSync(phrase, opts.passphrase ?? "");
  try {
    return pocketsFromSeed(seed, account, opts.coins ?? POCKET_COINS);
  } finally {
    seed.fill(0);
  }
}

export function pocketsFromSeed(seed: Uint8Array, account: number, coins: readonly PocketCoin[] = POCKET_COINS): PocketBundle {
  if (!validPocket(account)) throw new Error("Pocket number must be 1106–2105");
  const root = HDKey.fromMasterSeed(seed);
  const out: PocketBundle = { account, paths: [], xpubs: {}, xprvs: {}, addresses: {} };
  try {
    for (const coin of coins) {
      const path = accountPath(coin, account);
      out.paths.push(path);
      if (coin === "SOL") {
        const k = slip10Ed25519(seed, path);
        out.xpubs.SOL = base58.encode(k.publicKey);
        out.xprvs.SOL = hex.encode(k.privateKey);
        out.addresses.SOL = addressFor("SOL", k.publicKey);
        k.privateKey.fill(0);
        continue;
      }
      const node = root.derive(path);
      out.xpubs[coin] = node.publicExtendedKey;
      out.xprvs[coin] = node.privateExtendedKey;
      out.addresses[coin] = addressFor(coin, node.deriveChild(0).deriveChild(0).publicKey!);
      node.wipePrivateData();
    }
  } finally {
    root.wipePrivateData();
  }
  return out;
}

const LTC_VERSIONS = { public: 0x019da462, private: 0x019d9cfe };

function extKey(key: string): HDKey {
  return key.startsWith("Ltub") || key.startsWith("Ltpv") ? HDKey.fromExtendedKey(key, LTC_VERSIONS) : HDKey.fromExtendedKey(key);
}

/** Receive address from what a wallet submitted (account xpub, or SOL base58 public key). */
export function pocketReceiveAddress(coin: PocketCoin, pub: string): string {
  if (coin === "SOL") return addressFor("SOL", base58.decode(pub));
  return addressFor(coin, extKey(pub).deriveChild(0).deriveChild(0).publicKey!);
}

/** The private half a wallet sent must match its public half before Seeds stores it. */
export function pocketKeysMatch(coin: PocketCoin, priv: string, pub: string): boolean {
  try {
    if (coin === "SOL") {
      const k = hex.decode(priv);
      return k.length === 32 && base58.encode(ed25519.getPublicKey(k)) === pub;
    }
    const k = extKey(priv);
    const p = extKey(pub);
    if (!k.privateKey || !k.publicKey || !p.publicKey) return false;
    return hex.encode(k.publicKey) === hex.encode(p.publicKey) && hex.encode(k.chainCode!) === hex.encode(p.chainCode!);
  } catch {
    return false;
  }
}

/** Spending key for the pocket's receive address. Caller must wipe it. */
export function receivePrivateKey(coin: PocketCoin, priv: string): Uint8Array {
  if (coin === "SOL") return hex.decode(priv);
  const node = extKey(priv).deriveChild(0).deriveChild(0);
  const k = Uint8Array.from(node.privateKey!);
  node.wipePrivateData();
  return k;
}
