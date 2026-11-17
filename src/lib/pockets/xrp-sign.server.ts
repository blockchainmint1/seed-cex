/**
 * XRP Ledger Payment (native XRP) with an optional memo — canonical binary
 * serialization + secp256k1 signing, pure bytes. Only the fields Seeds uses.
 * THORChain reads the swap memo from the first Memo's MemoData.
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { concat, hash160, xrpDecodeAddress } from "./encode";

export type XrpPaymentParams = {
  privateKey: Uint8Array;
  to: string;
  /** drops (1 XRP = 1,000,000 drops) */
  drops: bigint;
  feeDrops: bigint;
  sequence: number;
  lastLedgerSequence: number;
  destinationTag?: number;
  memo?: string;
};

const sha512half = (b: Uint8Array) => sha512(b).slice(0, 32);
function u16be(n: number) { return Uint8Array.of(n >> 8, n & 0xff); }
function u32be(n: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, false); return b; }
function vl(len: number): Uint8Array {
  if (len <= 192) return Uint8Array.of(len);
  if (len <= 12480) { const l = len - 193; return Uint8Array.of(193 + (l >> 8), l & 0xff); }
  throw new Error("Field too long");
}
function amount(drops: bigint): Uint8Array {
  if (drops < 0n || drops > 100_000_000_000_000_000n) throw new Error("Bad XRP amount");
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, drops | 0x4000000000000000n, false);
  return b;
}
function fieldId(type: number, field: number): Uint8Array {
  if (type < 16 && field < 16) return Uint8Array.of((type << 4) | field);
  if (type < 16) return Uint8Array.of(type << 4, field);
  throw new Error("Unsupported field");
}

function serialize(p: XrpPaymentParams, pub: Uint8Array, sig?: Uint8Array): Uint8Array {
  const memo = p.memo ? new TextEncoder().encode(p.memo) : null;
  const parts: Uint8Array[] = [
    fieldId(1, 2), u16be(0),                 // TransactionType = Payment
    fieldId(2, 2), u32be(0x80000000),        // Flags = tfFullyCanonicalSig
    fieldId(2, 4), u32be(p.sequence),        // Sequence
  ];
  if (p.destinationTag !== undefined) parts.push(fieldId(2, 14), u32be(p.destinationTag));
  parts.push(
    fieldId(2, 27), u32be(p.lastLedgerSequence),
    fieldId(6, 1), amount(p.drops),
    fieldId(6, 8), amount(p.feeDrops),
    fieldId(7, 3), vl(pub.length), pub,
  );
  if (sig) parts.push(fieldId(7, 4), vl(sig.length), sig);
  parts.push(
    fieldId(8, 1), Uint8Array.of(20), hash160(pub),
    fieldId(8, 3), Uint8Array.of(20), xrpDecodeAddress(p.to),
  );
  if (memo) parts.push(fieldId(15, 9), fieldId(14, 10), fieldId(7, 13), vl(memo.length), memo, Uint8Array.of(0xe1), Uint8Array.of(0xf1));
  return concat(...parts);
}

export function signXrpPayment(p: XrpPaymentParams): { hex: string; hash: string } {
  if (p.feeDrops <= 0n || p.feeDrops > 1_000_000n) throw new Error("XRP fee outside 1 drop – 1 XRP");
  const pub = secp256k1.getPublicKey(p.privateKey, true);
  const unsigned = serialize(p, pub);
  const digest = sha512half(concat(Uint8Array.of(0x53, 0x54, 0x58, 0x00), unsigned));
  const sig = secp256k1.sign(digest, p.privateKey, { format: "der", prehash: false, lowS: true });
  const signed = serialize(p, pub, sig);
  const hash = sha512half(concat(Uint8Array.of(0x54, 0x58, 0x4e, 0x00), signed));
  return { hex: bytesToHex(signed).toUpperCase(), hash: bytesToHex(hash).toUpperCase() };
}
