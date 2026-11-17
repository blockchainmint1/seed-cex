/**
 * TRON native TRX transfer with a memo (raw_data.data), protobuf-encoded and
 * signed locally — Seeds never signs a transaction a remote node built.
 * Reference block bytes/hash come from the latest block; expiry ≤ 10 minutes.
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { concat, tronAddress, tronDecodeAddress } from "./encode";

export type TronTransferParams = {
  privateKey: Uint8Array;
  to: string;
  /** sun (1 TRX = 1,000,000 sun) */
  sun: bigint;
  /** latest block number and 32-byte block id (hex) */
  refBlockNum: number;
  refBlockId: string;
  /** ms since epoch */
  timestamp: number;
  memo?: string;
};

function varint(n: bigint): Uint8Array {
  if (n < 0n) throw new Error("negative varint");
  const out: number[] = [];
  do { let b = Number(n & 0x7fn); n >>= 7n; if (n) b |= 0x80; out.push(b); } while (n);
  return Uint8Array.from(out);
}
const key = (field: number, wire: number) => varint(BigInt((field << 3) | wire));
const bytesField = (f: number, b: Uint8Array) => concat(key(f, 2), varint(BigInt(b.length)), b);
const intField = (f: number, n: bigint) => concat(key(f, 0), varint(n));

export function encodeTronTransfer(p: Omit<TronTransferParams, "privateKey">, owner: Uint8Array): Uint8Array {
  if (p.sun <= 0n) throw new Error("Amount must be positive");
  const id = hexToBytes(p.refBlockId);
  if (id.length !== 32) throw new Error("Bad block id");
  const num = new Uint8Array(8);
  new DataView(num.buffer).setBigUint64(0, BigInt(p.refBlockNum), false);
  const transfer = concat(bytesField(1, owner), bytesField(2, tronDecodeAddress(p.to)), intField(3, p.sun));
  const any = concat(bytesField(1, new TextEncoder().encode("type.googleapis.com/protocol.TransferContract")), bytesField(2, transfer));
  const contract = concat(intField(1, 1n), bytesField(2, any));
  const parts = [
    bytesField(1, num.slice(6, 8)),           // ref_block_bytes
    bytesField(4, id.slice(8, 16)),           // ref_block_hash
    intField(8, BigInt(p.timestamp + 10 * 60_000)), // expiration
  ];
  if (p.memo) parts.push(bytesField(10, new TextEncoder().encode(p.memo)));
  parts.push(bytesField(11, contract), intField(14, BigInt(p.timestamp)));
  return concat(...parts);
}

export function signTronTransfer(p: TronTransferParams): { hex: string; txid: string; rawDataHex: string; signature: string; from: string } {
  const pub = secp256k1.getPublicKey(p.privateKey, true);
  const from = tronAddress(pub);
  const raw = encodeTronTransfer(p, tronDecodeAddress(from));
  const txid = sha256(raw);
  const rec = secp256k1.sign(txid, p.privateKey, { format: "recovered", prehash: false });
  // TRON wants r || s || v, v = recovery + 27.
  const sig = concat(rec.slice(1, 65), Uint8Array.of(rec[0] + 27));
  const tx = concat(bytesField(1, raw), bytesField(2, sig));
  return { hex: bytesToHex(tx), txid: bytesToHex(txid), rawDataHex: bytesToHex(raw), signature: bytesToHex(sig), from };
}
