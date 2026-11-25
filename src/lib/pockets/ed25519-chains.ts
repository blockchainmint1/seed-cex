/**
 * Stellar (XLM), TON and Sui pocket addresses from a SLIP-0010 ed25519 key.
 * Pure and client-safe. Formats are pinned in the wallet handoff (v3):
 * - XLM: m/44'/148'/1106', public half = Stellar "G…" address (SEP-0005, SEP-0023 strkey).
 * - TON: m/44'/607'/1106', public half = hex 32-byte key; address = wallet W5 (v5R1),
 *   workchain 0, mainnet wallet id, shown non-bounceable (UQ…).
 * - SUI: m/44'/784'/1106'/0'/0', public half = 0x… address (blake2b-256 of 0x00‖pubkey).
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base32nopad, base64urlnopad, hex } from "@scure/base";

export type EdChain = "XLM" | "TON" | "SUI";

function crc16xmodem(b: Uint8Array): number {
  let crc = 0;
  for (const byte of b) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function need32(pub: Uint8Array): void {
  if (pub.length !== 32) throw new Error("ed25519 public keys are 32 bytes");
}

// ---------- Stellar ----------
const XLM_ACCOUNT_VERSION = 6 << 3; // "G"

export function xlmAddress(pub: Uint8Array): string {
  need32(pub);
  const body = new Uint8Array(33);
  body[0] = XLM_ACCOUNT_VERSION;
  body.set(pub, 1);
  const crc = crc16xmodem(body);
  const full = new Uint8Array(35);
  full.set(body);
  full[33] = crc & 0xff; // little-endian checksum
  full[34] = crc >> 8;
  return base32nopad.encode(full);
}

export function xlmDecodeAddress(address: string): Uint8Array {
  if (!/^G[A-Z2-7]{55}$/.test(address)) throw new Error("bad Stellar address");
  const raw = base32nopad.decode(address);
  if (raw.length !== 35 || raw[0] !== XLM_ACCOUNT_VERSION) throw new Error("bad Stellar address");
  const crc = crc16xmodem(raw.slice(0, 33));
  if (raw[33] !== (crc & 0xff) || raw[34] !== crc >> 8) throw new Error("bad Stellar checksum");
  const pub = raw.slice(1, 33);
  if (xlmAddress(pub) !== address) throw new Error("bad Stellar address");
  return pub;
}

// ---------- Sui ----------
export function suiAddress(pub: Uint8Array): string {
  need32(pub);
  const data = new Uint8Array(33);
  data.set(pub, 1); // flag 0x00 = ed25519
  return "0x" + hex.encode(blake2b(data, { dkLen: 32 }));
}

export function validSuiAddress(a: string): boolean {
  return /^0x[0-9a-f]{64}$/.test(a);
}

// ---------- TON wallet W5 (v5R1) ----------
/** Representation hash and depth of the official W5 code cell (cross-checked against @ton/ton in tests). */
export const TON_W5_CODE_HASH = "20834b7b72b112147e1b2fb457b84e74d1a30f04f737d4f62a668e9552d2b72f";
const TON_W5_CODE_DEPTH = 6;
/** Mainnet (-239) XOR client context for workchain 0, version v5r1, subwallet 0. */
export const TON_W5_WALLET_ID = 0x7fffff11;

function tonDataCellHash(pub: Uint8Array): Uint8Array {
  // bits: 1 (signatures allowed) | 32 seqno=0 | 32 wallet id | 256 pubkey | 1 empty extensions = 322 bits
  const bits: number[] = [1];
  const pushUint = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  pushUint(0, 32);
  pushUint(TON_W5_WALLET_ID, 32);
  for (const byte of pub) pushUint(byte, 8);
  bits.push(0);
  const padded = [...bits, 1];
  while (padded.length % 8) padded.push(0);
  const data = new Uint8Array(padded.length / 8);
  padded.forEach((b, i) => { if (b) data[i >> 3]! |= 0x80 >> (i & 7); });
  const d2 = Math.floor(bits.length / 8) + Math.ceil(bits.length / 8);
  return sha256(Uint8Array.of(0, d2, ...data));
}

export function tonW5RawHash(pub: Uint8Array): Uint8Array {
  need32(pub);
  // StateInit bits "00110" (no split_depth, no special, code ref, data ref, no library) → 0x34 padded
  const repr = new Uint8Array(2 + 1 + 4 + 64);
  repr.set([2, 1, 0x34, 0, TON_W5_CODE_DEPTH, 0, 0]);
  repr.set(hex.decode(TON_W5_CODE_HASH), 7);
  repr.set(tonDataCellHash(pub), 39);
  return sha256(repr);
}

/** User-friendly, non-bounceable, mainnet, workchain 0 (UQ…). */
export function tonAddress(pub: Uint8Array): string {
  const body = new Uint8Array(34);
  body[0] = 0x51; // non-bounceable
  body[1] = 0x00; // workchain 0
  body.set(tonW5RawHash(pub), 2);
  const crc = crc16xmodem(body);
  return base64urlnopad.encode(Uint8Array.of(...body, crc >> 8, crc & 0xff));
}

export function parseTonPublicKey(s: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(s)) throw new Error("bad TON public key");
  return hex.decode(s);
}

// ---------- shared ----------
export function edAddress(chain: EdChain, pub: Uint8Array): string {
  return chain === "XLM" ? xlmAddress(pub) : chain === "TON" ? tonAddress(pub) : suiAddress(pub);
}

/** The public half a wallet submits for each chain (see header). */
export function edPublicHalf(chain: EdChain, pub: Uint8Array): string {
  return chain === "TON" ? hex.encode(pub) : edAddress(chain, pub);
}

/** Receive address from the submitted public half; throws on a malformed value. */
export function edReceiveAddress(chain: EdChain, pubHalf: string): string {
  if (chain === "XLM") { xlmDecodeAddress(pubHalf); return pubHalf; }
  if (chain === "TON") return tonAddress(parseTonPublicKey(pubHalf));
  if (!validSuiAddress(pubHalf)) throw new Error("bad Sui address");
  return pubHalf;
}

/** Private half (hex 32 bytes) must produce exactly the submitted public half. */
export function edKeysMatch(chain: EdChain, privHex: string, pubHalf: string): boolean {
  try {
    if (!/^[0-9a-f]{64}$/.test(privHex)) return false;
    return edPublicHalf(chain, ed25519.getPublicKey(hex.decode(privHex))) === pubHalf;
  } catch {
    return false;
  }
}
