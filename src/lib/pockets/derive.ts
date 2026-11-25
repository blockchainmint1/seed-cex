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
import { mnemonicToEntropy, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58, hex } from "@scure/base";
import { POCKET_COINS, accountPath, validPocket, type PocketCoin } from "./coins";
import { addressFor } from "./encode";
import { slip10Ed25519 } from "./slip10";
import { cardanoAccountXprv, cardanoBaseAddress, cardanoKeysMatch, parseCardanoXpub, softPrivateChild, xprvToXpub } from "./cardano";
import { edKeysMatch, edPublicHalf, edReceiveAddress, type EdChain } from "./ed25519-chains";
import { moneroAddress, moneroKeysFromSeedKey, moneroKeysMatch, moneroPublicToAddress } from "./monero";

export type PocketBundle = {
  account: number;
  paths: string[];
  /**
   * secp256k1: account xpub. SOL: base58 public key (no xpub exists for ed25519).
   * ADA: hex(A‖chain code). XMR: the Monero primary address.
   */
  xpubs: Partial<Record<PocketCoin, string>>;
  /** secp256k1: account xprv. SOL/XMR: hex 32-byte SLIP-0010 private key. ADA: hex(kL‖kR‖cc). Secret. */
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
  // Cardano (Icarus) derives from the words' entropy, not the BIP39 seed.
  const entropy = mnemonicToEntropy(phrase, wordlist);
  try {
    return pocketsFromSeed(seed, account, opts.coins ?? POCKET_COINS, { entropy, passphrase: opts.passphrase ?? "" });
  } finally {
    seed.fill(0);
    entropy.fill(0);
  }
}

/**
 * Cardano needs the recovery phrase's entropy (Icarus), so from a bare seed
 * (no `cardano` option) ADA is skipped rather than derived the wrong way.
 */
export function pocketsFromSeed(
  seed: Uint8Array, account: number, coins: readonly PocketCoin[] = POCKET_COINS,
  cardano?: { entropy: Uint8Array; passphrase: string },
): PocketBundle {
  if (!validPocket(account)) throw new Error("Pocket number must be 1106–2105");
  const root = HDKey.fromMasterSeed(seed);
  const out: PocketBundle = { account, paths: [], xpubs: {}, xprvs: {}, addresses: {} };
  try {
    for (const coin of coins) {
      const path = accountPath(coin, account);
      out.paths.push(path);
      if (coin === "ADA") {
        if (!cardano) { out.paths.pop(); continue; }
        const k = cardanoAccountXprv(cardano.entropy, account, cardano.passphrase);
        const pub = xprvToXpub(k);
        out.xpubs.ADA = hex.encode(pub);
        out.xprvs.ADA = hex.encode(k);
        out.addresses.ADA = cardanoBaseAddress(pub);
        k.fill(0);
        continue;
      }
      if (coin === "XLM" || coin === "TON" || coin === "SUI") {
        const k = slip10Ed25519(seed, path);
        out.xpubs[coin] = edPublicHalf(coin, k.publicKey);
        out.addresses[coin] = addressFor(coin, k.publicKey);
        out.xprvs[coin] = hex.encode(k.privateKey);
        k.privateKey.fill(0);
        continue;
      }
      if (coin === "SOL" || coin === "XMR") {
        const k = slip10Ed25519(seed, path);
        if (coin === "SOL") {
          out.xpubs.SOL = base58.encode(k.publicKey);
          out.addresses.SOL = addressFor("SOL", k.publicKey);
        } else {
          const m = moneroKeysFromSeedKey(k.privateKey);
          out.xpubs.XMR = out.addresses.XMR = moneroAddress(m.spendPub, m.viewPub);
          m.spendSec.fill(0); m.viewSec.fill(0);
        }
        out.xprvs[coin] = hex.encode(k.privateKey);
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

/** Receive address from what a wallet submitted (account xpub, SOL base58 key, ADA hex key, XMR address). */
export function pocketReceiveAddress(coin: PocketCoin, pub: string): string {
  if (coin === "SOL") return addressFor("SOL", base58.decode(pub));
  if (isEd(coin)) return edReceiveAddress(coin, pub);
  if (coin === "ADA") return cardanoBaseAddress(parseCardanoXpub(pub));
  if (coin === "XMR") return moneroPublicToAddress(pub);
  return addressFor(coin, extKey(pub).deriveChild(0).deriveChild(0).publicKey!);
}

/** The private half a wallet sent must match its public half before Seeds stores it. */
export function pocketKeysMatch(coin: PocketCoin, priv: string, pub: string): boolean {
  try {
    if (coin === "ADA") return cardanoKeysMatch(priv, pub);
    if (coin === "XMR") return moneroKeysMatch(priv, pub);
    if (isEd(coin)) return edKeysMatch(coin, priv, pub);
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

/**
 * Spending key for the pocket's receive address. Caller must wipe it.
 * ADA: 64-byte extended key (kL‖kR) of account/0/0. XMR: the private spend key.
 */
export function receivePrivateKey(coin: PocketCoin, priv: string): Uint8Array {
  if (coin === "SOL" || isEd(coin)) return hex.decode(priv);
  if (coin === "ADA") {
    const acct = hex.decode(priv);
    const role = softPrivateChild(acct, 0);
    const k = softPrivateChild(role, 0);
    acct.fill(0); role.fill(0);
    const out = k.slice(0, 64);
    k.fill(0);
    return out;
  }
  if (coin === "XMR") {
    const seedKey = hex.decode(priv);
    const m = moneroKeysFromSeedKey(seedKey);
    seedKey.fill(0); m.viewSec.fill(0);
    return m.spendSec;
  }
  const node = extKey(priv).deriveChild(0).deriveChild(0);
  const k = Uint8Array.from(node.privateKey!);
  node.wipePrivateData();
  return k;
}

function isEd(coin: PocketCoin): coin is EdChain {
  return coin === "XLM" || coin === "TON" || coin === "SUI";
}
