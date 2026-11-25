/**
 * Address encoders for every pocket coin. Pure, client-safe, no network.
 * Each takes the receive key's public key (33-byte compressed secp256k1,
 * or 32-byte ed25519 for Solana). Cardano and Monero addresses need two
 * keys each, so they live in cardano.ts / monero.ts instead.
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { base58, base58xrp, bech32, createBase58check } from "@scure/base";
import type { PocketCoin } from "./coins";

const b58c = createBase58check(sha256);

import { suiAddress, tonAddress, xlmAddress } from "./ed25519-chains";
export function hash160(b: Uint8Array): Uint8Array {
  return ripemd160(sha256(b));
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Base58Check P2PKH with a 1- or 2-byte version prefix (Zcash uses two). */
export function p2pkhAddress(version: number[], pubkey: Uint8Array): string {
  return b58c.encode(concat(Uint8Array.from(version), hash160(pubkey)));
}

/** Bitcoin Cash CashAddr P2PKH (version 0, 160-bit hash). Same encoder as HME Vault. */
export function cashAddrP2PKH(hash: Uint8Array): string {
  if (hash.length !== 20) throw new Error("CashAddr P2PKH needs a 20-byte hash");
  const ALPHABET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const PREFIX = "bitcoincash";
  const GEN = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];
  const payload: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const byte of [0, ...hash]) {
    acc = ((acc << 8) | byte) & 0xfff;
    bits += 8;
    while (bits >= 5) { bits -= 5; payload.push((acc >>> bits) & 31); }
  }
  if (bits > 0) payload.push((acc << (5 - bits)) & 31);
  let chk = 1n;
  for (const v of [...Array.from(PREFIX, (c) => c.charCodeAt(0) & 31), 0, ...payload, ...Array<number>(8).fill(0)]) {
    const top = chk >> 35n;
    chk = ((chk & 0x07ffffffffn) << 5n) ^ BigInt(v);
    for (const [i, g] of GEN.entries()) if ((top & (1n << BigInt(i))) !== 0n) chk ^= g;
  }
  chk ^= 1n;
  const out = [...payload];
  for (let i = 7; i >= 0; i--) out.push(Number((chk >> BigInt(5 * i)) & 31n));
  return `${PREFIX}:${out.map((v) => ALPHABET[v]).join("")}`;
}

/** Decode a CashAddr P2PKH back to its 20-byte hash (checksum verified by re-encoding). */
export function cashAddrToHash(address: string): Uint8Array {
  const a = address.toLowerCase().startsWith("bitcoincash:") ? address.toLowerCase() : `bitcoincash:${address.toLowerCase()}`;
  const ALPHABET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const data = a.slice("bitcoincash:".length);
  if (data.length !== 42 || data[0] !== "q") throw new Error("Only CashAddr P2PKH (q…) is supported");
  const vals = Array.from(data.slice(0, 34), (c) => {
    const v = ALPHABET.indexOf(c);
    if (v < 0) throw new Error("Bad CashAddr character");
    return v;
  });
  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const v of vals) {
    acc = (acc << 5) | v; bits += 5;
    while (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 0xff); }
    acc &= (1 << bits) - 1;
  }
  const hash = Uint8Array.from(bytes.slice(1, 21));
  if (bytes[0] !== 0 || cashAddrP2PKH(hash) !== a) throw new Error("Bad CashAddr checksum");
  return hash;
}

function sha256d(b: Uint8Array): Uint8Array {
  return sha256(sha256(b));
}

/** XRP classic address: ripple alphabet, version 0, hash160 of the compressed key. */
export function xrpAddress(pubkey: Uint8Array): string {
  return xrpEncodeAccountId(hash160(pubkey));
}
export function xrpEncodeAccountId(id: Uint8Array): string {
  const body = concat(Uint8Array.of(0), id);
  return base58xrp.encode(concat(body, sha256d(body).slice(0, 4)));
}
export function xrpDecodeAddress(address: string): Uint8Array {
  const raw = base58xrp.decode(address);
  if (raw.length !== 25 || raw[0] !== 0) throw new Error("Bad XRP address");
  const body = raw.slice(0, 21);
  const sum = sha256d(body).slice(0, 4);
  if (sum.some((v, i) => v !== raw[21 + i])) throw new Error("Bad XRP address checksum");
  return raw.slice(1, 21);
}

function uncompressed(pubkey: Uint8Array): Uint8Array {
  return secp256k1.Point.fromBytes(pubkey).toBytes(false).slice(1);
}

/** TRON: 0x41 + last 20 bytes of keccak(uncompressed key), Base58Check. */
export function tronAddress(pubkey: Uint8Array): string {
  return b58c.encode(concat(Uint8Array.of(0x41), keccak_256(uncompressed(pubkey)).slice(-20)));
}
export function tronDecodeAddress(address: string): Uint8Array {
  const raw = b58c.decode(address);
  if (raw.length !== 21 || raw[0] !== 0x41) throw new Error("Bad TRON address");
  return raw;
}

/** EIP-55 checksummed EVM address. */
export function evmAddress(pubkey: Uint8Array): string {
  const raw = bytesToHex(keccak_256(uncompressed(pubkey)).slice(-20));
  const h = bytesToHex(keccak_256(new TextEncoder().encode(raw)));
  return "0x" + Array.from(raw, (c, i) => (parseInt(h[i], 16) >= 8 ? c.toUpperCase() : c)).join("");
}

export function solAddress(pubkey32: Uint8Array): string {
  if (pubkey32.length !== 32) throw new Error("Solana keys are 32 bytes");
  return base58.encode(pubkey32);
}

/** Receive address for a pocket coin from its receive public key. */
export function addressFor(coin: PocketCoin, pubkey: Uint8Array): string {
  switch (coin) {
    case "TXC": return p2pkhAddress([66], pubkey);
    case "ISK": return p2pkhAddress([45], pubkey);
    case "LTC": return p2pkhAddress([48], pubkey);
    case "DOGE": return p2pkhAddress([30], pubkey);
    case "ZEC": return p2pkhAddress([0x1c, 0xb8], pubkey);
    case "BTC": return bech32.encode("bc", [0, ...bech32.toWords(hash160(pubkey))]);
    case "BCH": return cashAddrP2PKH(hash160(pubkey));
    case "XRP": return xrpAddress(pubkey);
    case "TRX": return tronAddress(pubkey);
    case "EVM": return evmAddress(pubkey);
    case "SOL": return solAddress(pubkey);
    case "DASH": return p2pkhAddress([76], pubkey);
    case "ATOM": return bech32.encode("cosmos", bech32.toWords(hash160(pubkey)));
    case "RUNE": return bech32.encode("thor", bech32.toWords(hash160(pubkey)));
    case "XLM": return xlmAddress(pubkey);
    case "TON": return tonAddress(pubkey);
    case "SUI": return suiAddress(pubkey);
    case "ADA":
    case "XMR":
      throw new Error(`${coin} addresses are built from two keys — use cardano.ts / monero.ts`);
  }
}
