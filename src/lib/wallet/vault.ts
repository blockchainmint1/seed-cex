/**
 * Browser-only wallet vault.
 *
 * NOTHING in this file may ever run on the server or send plaintext anywhere.
 * The mnemonic, the derived keys, and the user's password exist only inside the
 * user's tab. What leaves this module is: ciphertext, a salt, and public
 * addresses. That is the entire non-custodial guarantee.
 */
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { HDKey } from "@scure/bip32";
import { base58check, bech32 } from "@scure/base";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

/**
 * TEXITcoin mainnet params, read from the open-source chainparams.cpp:
 *   base58Prefixes[PUBKEY_ADDRESS] = 66  -> addresses start with "T"
 *   bech32_hrp = "txc"
 * TXC is registered in SLIP-0044 as coin type 696969, and the official
 * wallet.texitcoin.org uses m/44'/696969'/0' (BIP44) — we match it.
 */
const TXC_PUBKEY_VERSION = 66;
const TXC_COIN_TYPE = 696969;
const TXC_PATH = `m/44'/${TXC_COIN_TYPE}'/0'/0/0`;
const EVM_PATH = "m/44'/60'/0'/0/0";


export const KDF_ITERATIONS = 600_000;

const b58check = base58check(sha256);

function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

/** Legacy base58 P2PKH address for any Bitcoin-derived chain. */
export function p2pkhAddressFromPubkey(pubkey: Uint8Array, version: number): string {
  const payload = new Uint8Array(21);
  payload[0] = version;
  payload.set(hash160(pubkey), 1);
  return b58check.encode(payload);
}

/** P2PKH address for the TEXITcoin mainnet. */
export function txcAddressFromPubkey(pubkey: Uint8Array): string {
  return p2pkhAddressFromPubkey(pubkey, TXC_PUBKEY_VERSION);
}

/** EIP-55 checksummed address, for the USDC side of a pair. */
export function evmAddressFromPubkey(uncompressed: Uint8Array): string {
  const body = uncompressed.length === 65 ? uncompressed.slice(1) : uncompressed;
  const raw = bytesToHex(keccak_256(body)).slice(-40);
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(raw)));
  let out = "0x";
  for (let i = 0; i < raw.length; i++) {
    out += parseInt(hash[i], 16) >= 8 ? raw[i].toUpperCase() : raw[i];
  }
  return out;
}

/** Litecoin + Iskandercoin savings branches (LTC coin type, forked params). */
const LTC_PATH = "m/44'/2'/0'/0/0";
const LTC_PUBKEY_VERSION = 48;
const ISK_PATH = "m/44'/2'/10'/0/0";
const ISK_PUBKEY_VERSION = 45;

/**
 * Bitcoin mainnet, BIP-84 native segwit.
 *
 * BTC has no savings role on Seeds: you deposit to trade, and trading means
 * wrapping. So the only BTC address we ever show is the *shared trading*
 * branch (account 9'), the same branch every other chain authorizes from.
 */
export const SHARED_BTC_PATH = "m/84'/0'/9'/0/0";
const BTC_HRP = "bc";

/** BIP-173 P2WPKH (bech32, `bc1q…`) address for a compressed pubkey. */
export function p2wpkhAddressFromPubkey(pubkey: Uint8Array, hrp = BTC_HRP): string {
  return bech32.encode(hrp, [0, ...bech32.toWords(hash160(pubkey))]);
}

export type DerivedAddresses = {
  txcAddress: string;
  evmAddress: string;
  ltcAddress: string;
  iskAddress: string;
  /** BTC shared-trading branch — the address we hand out for deposits. */
  btcAddress: string;
};

export function deriveAddresses(mnemonic: string): DerivedAddresses {
  const seed = mnemonicToSeedSync(mnemonic);
  const root = HDKey.fromMasterSeed(seed);

  const txcNode = root.derive(TXC_PATH);
  if (!txcNode.publicKey) throw new Error("Could not derive the TXC key");

  const evmNode = root.derive(EVM_PATH);
  if (!evmNode.publicKey) throw new Error("Could not derive the EVM key");
  // BIP-32 gives us the compressed point; keccak needs the uncompressed body.
  const uncompressed = secp256k1.Point.fromBytes(evmNode.publicKey).toBytes(false);

  const ltcNode = root.derive(LTC_PATH);
  const iskNode = root.derive(ISK_PATH);
  if (!ltcNode.publicKey || !iskNode.publicKey) throw new Error("Could not derive the UTXO keys");

  const btcNode = root.derive(SHARED_BTC_PATH);
  if (!btcNode.publicKey) throw new Error("Could not derive the BTC key");

  return {
    txcAddress: txcAddressFromPubkey(txcNode.publicKey),
    evmAddress: evmAddressFromPubkey(uncompressed),
    ltcAddress: p2pkhAddressFromPubkey(ltcNode.publicKey, LTC_PUBKEY_VERSION),
    iskAddress: p2pkhAddressFromPubkey(iskNode.publicKey, ISK_PUBKEY_VERSION),
    btcAddress: p2wpkhAddressFromPubkey(btcNode.publicKey),
  };
}

/**
 * The *shared* trading account.
 *
 * This is the one branch of the tree the user may choose to co-share with
 * Seeds so trades can settle without waiting for them to be online. It is a
 * separate hardened account (9') on each chain: knowing it never reveals the
 * master seed and never reaches the user's savings accounts at 0'. The user
 * keeps the identical key (they own the seed), can sweep it at any moment, and
 * can revoke.
 */
export const SHARED_TRADING_PATH = `m/44'/${TXC_COIN_TYPE}'/9'/0/0`;
export const SHARED_EVM_PATH = "m/44'/60'/9'/0/0";

export type SharedTradingKey = {
  path: string;
  privateKeyHex: string;
  address: string;
};

/**
 * Derive the shared branch key for a given BIP-44 path and address family.
 * `kind` is "evm" for account-model chains, or the base58 P2PKH version byte
 * for a UTXO chain (66 TXC, 48 LTC, 45 ISK).
 */
export function deriveSharedKey(
  mnemonic: string,
  path: string,
  kind: "txc" | "evm" | number,
): SharedTradingKey {
  const root = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic));
  const node = root.derive(path);
  if (!node.privateKey || !node.publicKey) {
    throw new Error("Could not derive the shared trading key");
  }
  const version = kind === "txc" ? TXC_PUBKEY_VERSION : typeof kind === "number" ? kind : null;
  const address =
    version !== null
      ? p2pkhAddressFromPubkey(node.publicKey, version)
      : evmAddressFromPubkey(secp256k1.Point.fromBytes(node.publicKey).toBytes(false));
  return { path, privateKeyHex: bytesToHex(node.privateKey), address };
}

export function deriveSharedTradingKey(mnemonic: string): SharedTradingKey {
  return deriveSharedKey(mnemonic, SHARED_TRADING_PATH, "txc");
}

export function newMnemonic(): string {
  return generateMnemonic(wordlist, 128);
}


export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic.trim().toLowerCase(), wordlist);
}

/* ------------------------------------------------------------------ */
/* AES-256-GCM vault, key-stretched with PBKDF2-SHA256                  */
/* ------------------------------------------------------------------ */

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export type Vault = { ciphertext: string; salt: string; iterations: number };

export async function encryptMnemonic(mnemonic: string, password: string): Promise<Vault> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, KDF_ITERATIONS);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      new TextEncoder().encode(mnemonic),
    ),
  );
  const packed = new Uint8Array(iv.length + ct.length);
  packed.set(iv, 0);
  packed.set(ct, iv.length);
  return { ciphertext: toB64(packed), salt: toB64(salt), iterations: KDF_ITERATIONS };
}

export async function decryptMnemonic(vault: Vault, password: string): Promise<string> {
  const packed = fromB64(vault.ciphertext);
  const iv = packed.slice(0, 12);
  const ct = packed.slice(12);
  const key = await deriveKey(password, fromB64(vault.salt), vault.iterations || KDF_ITERATIONS);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ct as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error("Wrong password — the vault could not be unlocked.");
  }
}
