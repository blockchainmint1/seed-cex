/**
 * Locked trading balance: a shared lock address on TXC (and ISK) that needs BOTH the
 * member's trading-pocket key and Seeds' key to move, OR the member alone once the coins
 * have sat still for `csvBlocks` blocks (automatic refund if Seeds ever disappears).
 *
 * Pure bytes — no network, no keys stored. Spec: docs/locked-trading-balance-spec.md.
 *
 * Witness script (P2WSH, segwit v0):
 *   OP_IF
 *     <seedsPub> OP_CHECKSIGVERIFY          cooperative path: Seeds co-signs
 *   OP_ELSE
 *     <csvBlocks> OP_CHECKSEQUENCEVERIFY OP_DROP   refund path: wait, then member alone
 *   OP_ENDIF
 *   <memberPub> OP_CHECKSIG                 the member signs on both paths
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { base58check, bech32 } from "@scure/base";

export type LockChain = "TXC" | "ISK";
export const LOCK_HRP: Record<LockChain, string> = { TXC: "txc", ISK: "isk" };

/** ~30 days at TXC's measured ~181 s blocks (14,400 × 3 min). */
export const LOCK_CSV_BLOCKS = 14_400;
/** Stop treating a lock as safe ~2 days (960 blocks) before the member could refund alone. */
export const LOCK_SAFETY_MARGIN = 960;
/** BIP68 block-based relative locks are 16-bit; ≥17 keeps the push a plain minimal number. */
export const LOCK_CSV_MIN = 17;
export const LOCK_CSV_MAX = 0xffff;

const OP = { IF: 0x63, ELSE: 0x67, ENDIF: 0x68, DROP: 0x75, CHECKSIG: 0xac, CHECKSIGVERIFY: 0xad, CSV: 0xb2 } as const;

export type LockTerms = { seedsPub: Uint8Array; memberPub: Uint8Array; csvBlocks: number };

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Minimal little-endian script number (positive only). */
export function scriptNum(n: number): Uint8Array {
  if (!Number.isInteger(n) || n <= 0) throw new Error("scriptNum: positive integers only");
  const bytes: number[] = [];
  let v = n;
  while (v > 0) { bytes.push(v & 0xff); v = Math.floor(v / 256); }
  if (bytes[bytes.length - 1]! & 0x80) bytes.push(0);
  return Uint8Array.from(bytes);
}

function readScriptNum(b: Uint8Array): number {
  if (b.length === 0 || b.length > 4) return -1;
  if (b[b.length - 1]! & 0x80) return -1; // negative
  if (b.length > 1 && b[b.length - 1] === 0 && !(b[b.length - 2]! & 0x80)) return -1; // not minimal
  if (b[b.length - 1] === 0 && b.length === 1) return -1;
  let n = 0;
  for (let i = b.length - 1; i >= 0; i--) n = n * 256 + b[i]!;
  return n;
}

export function assertPubkey(pub: Uint8Array, label: string) {
  if (pub.length !== 33 || (pub[0] !== 2 && pub[0] !== 3)) throw new Error(`${label} must be a compressed public key`);
  try { secp256k1.Point.fromHex(bytesToHex(pub)); } catch { throw new Error(`${label} is not a valid public key`); }
}

export function assertTerms(t: LockTerms) {
  assertPubkey(t.seedsPub, "Seeds key");
  assertPubkey(t.memberPub, "Member key");
  if (bytesToHex(t.seedsPub) === bytesToHex(t.memberPub)) throw new Error("Seeds and member keys must differ");
  if (!Number.isInteger(t.csvBlocks) || t.csvBlocks < LOCK_CSV_MIN || t.csvBlocks > LOCK_CSV_MAX)
    throw new Error(`Refund delay must be ${LOCK_CSV_MIN}–${LOCK_CSV_MAX} blocks`);
}

export function buildLockScript(t: LockTerms): Uint8Array {
  assertTerms(t);
  const csv = scriptNum(t.csvBlocks);
  return concat(
    Uint8Array.of(OP.IF, 33), t.seedsPub, Uint8Array.of(OP.CHECKSIGVERIFY),
    Uint8Array.of(OP.ELSE, csv.length), csv, Uint8Array.of(OP.CSV, OP.DROP),
    Uint8Array.of(OP.ENDIF, 33), t.memberPub, Uint8Array.of(OP.CHECKSIG),
  );
}

/** Exact-template parse. Anything that isn't byte-for-byte this lock returns null. */
export function parseLockScript(s: Uint8Array): LockTerms | null {
  if (s.length < 75 || s[0] !== OP.IF || s[1] !== 33 || s[35] !== OP.CHECKSIGVERIFY || s[36] !== OP.ELSE) return null;
  const n = s[37]!;
  if (n < 1 || n > 3) return null;
  const end = 38 + n;
  if (s.length !== end + 38) return null;
  if (s[end] !== OP.CSV || s[end + 1] !== OP.DROP || s[end + 2] !== OP.ENDIF || s[end + 3] !== 33 || s[end + 37] !== OP.CHECKSIG) return null;
  const terms = { seedsPub: s.slice(2, 35), memberPub: s.slice(end + 4, end + 37), csvBlocks: readScriptNum(s.slice(38, end)) };
  try { assertTerms(terms); } catch { return null; }
  return terms;
}

/** 0x00 0x20 <sha256(witnessScript)> */
export function lockScriptPubKey(witnessScript: Uint8Array): Uint8Array {
  return concat(Uint8Array.of(0x00, 0x20), sha256(witnessScript));
}

export function lockAddress(witnessScript: Uint8Array, chain: LockChain = "TXC"): string {
  return bech32.encode(LOCK_HRP[chain], [0, ...bech32.toWords(sha256(witnessScript))]);
}

/** Legacy P2SH version bytes, confirmed with validateaddress on each node: TXC 65 ("T…"), ISK 44 ("J…"). */
export const LOCK_P2SH_VERSION: Record<LockChain, number> = { TXC: 65, ISK: 44 };
export type LockWrapper = "p2sh" | "p2wsh";
/** P2SH is the default on TEXITcoin until a live test proves Omni reads P2WSH senders (auditor, 2026-11-17). */
export const DEFAULT_WRAPPER: LockWrapper = "p2sh";

const hash160 = (b: Uint8Array) => ripemd160(sha256(b));
/** a9 14 <hash160(redeemScript)> 87 */
export const lockP2shScriptPubKey = (redeemScript: Uint8Array) => concat(Uint8Array.of(0xa9, 0x14), hash160(redeemScript), Uint8Array.of(0x87));
export function lockP2shAddress(redeemScript: Uint8Array, chain: LockChain = "TXC"): string {
  return base58check(sha256).encode(concat(Uint8Array.of(LOCK_P2SH_VERSION[chain]), hash160(redeemScript)));
}
export const lockAddressFor = (ws: Uint8Array, chain: LockChain, wrapper: LockWrapper) =>
  wrapper === "p2sh" ? lockP2shAddress(ws, chain) : lockAddress(ws, chain);
export const lockScriptPubKeyFor = (ws: Uint8Array, wrapper: LockWrapper) =>
  wrapper === "p2sh" ? lockP2shScriptPubKey(ws) : lockScriptPubKey(ws);

/**
 * Per-member Seeds key, derived from one server secret so nothing per-member is stored.
 * `generation` bumps when a lock is rebuilt (e.g. after pocket rotation).
 */
export function deriveSeedsLockKey(master: Uint8Array, memberId: string, chain: LockChain, generation = 0): { privateKey: Uint8Array; publicKey: Uint8Array } {
  if (master.length < 32) throw new Error("Lock master secret must be at least 32 bytes");
  if (!memberId) throw new Error("memberId required");
  for (let ctr = 0; ctr < 8; ctr++) {
    const k = hmac(sha256, master, new TextEncoder().encode(`seeds-lock/v1/${chain}/${memberId}/${generation}/${ctr}`));
    if (secp256k1.utils.isValidSecretKey(k)) return { privateKey: k, publicKey: secp256k1.getPublicKey(k, true) };
  }
  throw new Error("Could not derive a lock key");
}

/**
 * Is the lock still safe to settle from instantly? A coin at the lock address can be
 * refunded by the member alone once it has `csvBlocks` confirmations, so the lock is only
 * "strong" while EVERY coin there is younger than csvBlocks − margin.
 */
export type LockStrength = { state: "strong" | "refreshing_soon" | "weak"; blocksLeft: number };
export function lockStrength(confirmations: number[], csvBlocks = LOCK_CSV_BLOCKS, margin = LOCK_SAFETY_MARGIN): LockStrength {
  const oldest = confirmations.length ? Math.max(...confirmations) : 0;
  const blocksLeft = csvBlocks - margin - oldest;
  if (blocksLeft <= 0) return { state: "weak", blocksLeft: 0 };
  if (blocksLeft <= margin) return { state: "refreshing_soon", blocksLeft };
  return { state: "strong", blocksLeft };
}

// ── Transactions (segwit v0, BIP143) ────────────────────────────────────────

export type TxIn = { txid: string; vout: number; sequence: number; scriptSig?: Uint8Array };
export type TxOut = { value: bigint; script: Uint8Array };
export type Tx = { version: number; inputs: TxIn[]; outputs: TxOut[]; locktime: number };

const dsha = (b: Uint8Array) => sha256(sha256(b));
function u32(n: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; }
function u64(n: bigint) { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, n, true); return b; }
export function varint(n: number) {
  if (n < 0xfd) return Uint8Array.of(n);
  if (n <= 0xffff) return Uint8Array.of(0xfd, n & 0xff, n >> 8);
  return concat(Uint8Array.of(0xfe), u32(n));
}
const varBytes = (b: Uint8Array) => concat(varint(b.length), b);
const outpoint = (i: TxIn) => concat(hexToBytes(i.txid).reverse(), u32(i.vout));
const serOut = (o: TxOut) => concat(u64(o.value), varBytes(o.script));

export const SIGHASH_ALL = 1;

/** BIP143 signature hash for a segwit v0 input. scriptCode is the witnessScript itself. */
export function bip143Sighash(tx: Tx, index: number, scriptCode: Uint8Array, value: bigint, hashType = SIGHASH_ALL): Uint8Array {
  if (hashType !== SIGHASH_ALL) throw new Error("Only SIGHASH_ALL is allowed for locks");
  const inp = tx.inputs[index];
  if (!inp) throw new Error("No such input");
  const hashPrevouts = dsha(concat(...tx.inputs.map(outpoint)));
  const hashSequence = dsha(concat(...tx.inputs.map((i) => u32(i.sequence))));
  const hashOutputs = dsha(concat(...tx.outputs.map(serOut)));
  return dsha(concat(
    u32(tx.version), hashPrevouts, hashSequence, outpoint(inp), varBytes(scriptCode), u64(value), u32(inp.sequence),
    hashOutputs, u32(tx.locktime), u32(hashType),
  ));
}

/** DER signature + sighash byte, low-S (noble default). */
export function signLockInput(tx: Tx, index: number, witnessScript: Uint8Array, value: bigint, privateKey: Uint8Array): Uint8Array {
  const h = bip143Sighash(tx, index, witnessScript, value);
  const der = secp256k1.sign(h, privateKey, { prehash: false, format: "der", lowS: true });
  return concat(der, Uint8Array.of(SIGHASH_ALL));
}

export function verifyLockSig(tx: Tx, index: number, witnessScript: Uint8Array, value: bigint, sigWithType: Uint8Array, pub: Uint8Array): boolean {
  if (sigWithType[sigWithType.length - 1] !== SIGHASH_ALL) return false;
  const h = bip143Sighash(tx, index, witnessScript, value);
  try {
    return secp256k1.verify(sigWithType.slice(0, -1), h, pub, { prehash: false, format: "der", lowS: true });
  } catch { return false; }
}

/** Witness stack, bottom → top. Cooperative: member sig, Seeds sig, TRUE, script. */
export const cooperativeWitness = (memberSig: Uint8Array, seedsSig: Uint8Array, ws: Uint8Array) => [memberSig, seedsSig, Uint8Array.of(1), ws];
/** Refund: member sig, FALSE (empty), script. Input nSequence must be ≥ csvBlocks, tx version ≥ 2. */
export const refundWitness = (memberSig: Uint8Array, ws: Uint8Array) => [memberSig, new Uint8Array(0), ws];

export function serializeTx(tx: Tx, witnesses?: Uint8Array[][]): Uint8Array {
  const hasW = !!witnesses?.some((w) => w.length);
  const ins = concat(varint(tx.inputs.length), ...tx.inputs.map((i) => concat(outpoint(i), varBytes(i.scriptSig ?? new Uint8Array(0)), u32(i.sequence))));
  const outs = concat(varint(tx.outputs.length), ...tx.outputs.map(serOut));
  const wit = hasW ? concat(...tx.inputs.map((_, k) => { const w = witnesses![k] ?? []; return concat(varint(w.length), ...w.map(varBytes)); })) : new Uint8Array(0);
  return concat(u32(tx.version), hasW ? Uint8Array.of(0, 1) : new Uint8Array(0), ins, outs, wit, u32(tx.locktime));
}

export const txid = (tx: Tx) => bytesToHex(dsha(serializeTx(tx)).reverse());

/**
 * Cooperative spends are final and do NOT signal replace-by-fee (auditor): a stuck trade is
 * re-signed by Seeds, never fee-bumped in place. Refunds carry the relative lock = csvBlocks.
 */
export const COOP_SEQUENCE = 0xffffffff;
export const refundSequence = (csvBlocks: number) => csvBlocks; // BIP68: type flag 0 = blocks

// ── Legacy P2SH signing ─────────────────────────────────────────────────────

/** Legacy SIGHASH_ALL digest: every scriptSig blanked except this input's = redeemScript. */
export function legacySighash(tx: Tx, index: number, redeemScript: Uint8Array): Uint8Array {
  if (!tx.inputs[index]) throw new Error("No such input");
  const blank: Tx = { ...tx, inputs: tx.inputs.map((i, k) => ({ txid: i.txid, vout: i.vout, sequence: i.sequence, scriptSig: k === index ? redeemScript : new Uint8Array(0) })) };
  return dsha(concat(serializeTx(blank), u32(SIGHASH_ALL)));
}

export type LockSigner = { tx: Tx; index: number; ws: Uint8Array; value: bigint; wrapper: LockWrapper };
export const lockSighash = (p: LockSigner) => p.wrapper === "p2sh" ? legacySighash(p.tx, p.index, p.ws) : bip143Sighash(p.tx, p.index, p.ws, p.value);

export function signLock(p: LockSigner, privateKey: Uint8Array): Uint8Array {
  const der = secp256k1.sign(lockSighash(p), privateKey, { prehash: false, format: "der", lowS: true });
  return concat(der, Uint8Array.of(SIGHASH_ALL));
}
export function verifyLock(p: LockSigner, sigWithType: Uint8Array, pub: Uint8Array): boolean {
  if (sigWithType.length < 9 || sigWithType[sigWithType.length - 1] !== SIGHASH_ALL) return false;
  try { return secp256k1.verify(sigWithType.slice(0, -1), lockSighash(p), pub, { prehash: false, format: "der", lowS: true }); } catch { return false; }
}

const push = (d: Uint8Array) => d.length < 0x4c ? concat(Uint8Array.of(d.length), d) : concat(Uint8Array.of(0x4c, d.length), d);
/** P2SH scriptSigs. Cooperative: <memberSig> <seedsSig> OP_1 <redeem>. Refund: <memberSig> OP_0 <redeem>. */
export const p2shCooperativeScriptSig = (memberSig: Uint8Array, seedsSig: Uint8Array, rs: Uint8Array) => concat(push(memberSig), push(seedsSig), Uint8Array.of(0x51), push(rs));
export const p2shRefundScriptSig = (memberSig: Uint8Array, rs: Uint8Array) => concat(push(memberSig), Uint8Array.of(0x00), push(rs));

/** Put the finished signatures into the tx for either wrapper; returns the broadcastable hex. */
export function finalizeLockTx(tx: Tx, ws: Uint8Array, wrapper: LockWrapper, sigs: { member: Uint8Array; seeds?: Uint8Array }[]): string {
  if (sigs.length !== tx.inputs.length) throw new Error("One signature set per input");
  if (wrapper === "p2sh") {
    const signed: Tx = { ...tx, inputs: tx.inputs.map((i, k) => ({ ...i, scriptSig: sigs[k]!.seeds ? p2shCooperativeScriptSig(sigs[k]!.member, sigs[k]!.seeds!, ws) : p2shRefundScriptSig(sigs[k]!.member, ws) })) };
    return bytesToHex(serializeTx(signed));
  }
  const w = sigs.map((s) => s.seeds ? cooperativeWitness(s.member, s.seeds, ws) : refundWitness(s.member, ws));
  return bytesToHex(serializeTx(tx, w));
}

/** Parse a node-built (unsigned, non-segwit) raw tx into our Tx shape. */
export function parseUnsignedTx(hex: string): Tx {
  const b = hexToBytes(hex.toLowerCase());
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 0;
  const rv = (): number => { const f = b[o]!; if (f < 0xfd) { o += 1; return f; } if (f === 0xfd) { const v = dv.getUint16(o + 1, true); o += 3; return v; } const v = dv.getUint32(o + 1, true); o += 5; return v; };
  const version = dv.getUint32(0, true); o = 4;
  if (b[o] === 0) throw new Error("Expected an unsigned legacy-serialised transaction");
  const nIn = rv(); const inputs: TxIn[] = [];
  for (let i = 0; i < nIn; i++) {
    const txid = bytesToHex(b.slice(o, o + 32).reverse()); o += 32;
    const vout = dv.getUint32(o, true); o += 4;
    const sl = rv(); if (sl !== 0) throw new Error("Inputs must be unsigned"); 
    const sequence = dv.getUint32(o, true); o += 4;
    inputs.push({ txid, vout, sequence });
  }
  const nOut = rv(); const outputs: TxOut[] = [];
  for (let i = 0; i < nOut; i++) {
    const value = dv.getBigUint64(o, true); o += 8;
    const sl = rv(); outputs.push({ value, script: b.slice(o, o + sl) }); o += sl;
  }
  const locktime = dv.getUint32(o, true); o += 4;
  if (o !== b.length) throw new Error("Trailing bytes in transaction");
  return { version, inputs, outputs, locktime };
}
