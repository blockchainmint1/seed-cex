/**
 * Seeds Lend lockbox — pure bytes (tested). One lockbox per loan on TEXITcoin:
 *
 *   OP_2 <borrowerPub> <lenderPub> <seedsPub> OP_3 OP_CHECKMULTISIG   (P2SH, legacy)
 *
 * Any two of the three keys move the coins:
 *  - borrower + Seeds  → back to the borrower (repaid, or the loan never started)
 *  - lender + Seeds    → liquidation / default payout, split by liquidationSplit()
 *  - borrower + lender → both members together, without Seeds (if Seeds ever disappears)
 * Seeds alone can never move a lockbox. P2SH because TEXITcoin's Omni layer ignores P2WSH.
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { base58check } from "@scure/base";
import { assertPubkey, legacySighash, lockP2shAddress, lockP2shScriptPubKey, serializeTx, SIGHASH_ALL, type Tx } from "@/lib/lock/script";

const OP_2 = 0x52, OP_3 = 0x53, OP_CHECKMULTISIG = 0xae;
const b58 = base58check(sha256);
const hash160 = (b: Uint8Array) => ripemd160(sha256(b));

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export type EscrowKeys = { borrowerPub: Uint8Array; lenderPub: Uint8Array; seedsPub: Uint8Array };
export type EscrowRole = "borrower" | "lender" | "seeds";
export const ROLE_ORDER: EscrowRole[] = ["borrower", "lender", "seeds"];

export function buildEscrowScript(k: EscrowKeys): Uint8Array {
  assertPubkey(k.borrowerPub, "Borrower key");
  assertPubkey(k.lenderPub, "Lender key");
  assertPubkey(k.seedsPub, "Seeds key");
  const hex = [k.borrowerPub, k.lenderPub, k.seedsPub].map(bytesToHex);
  if (new Set(hex).size !== 3) throw new Error("The three lockbox keys must all be different");
  return concat(
    Uint8Array.of(OP_2, 33), k.borrowerPub, Uint8Array.of(33), k.lenderPub, Uint8Array.of(33), k.seedsPub,
    Uint8Array.of(OP_3, OP_CHECKMULTISIG),
  );
}

/** Exact-template parse; anything else is null. */
export function parseEscrowScript(s: Uint8Array): EscrowKeys | null {
  if (s.length !== 105 || s[0] !== OP_2 || s[1] !== 33 || s[35] !== 33 || s[69] !== 33 || s[103] !== OP_3 || s[104] !== OP_CHECKMULTISIG) return null;
  const k = { borrowerPub: s.slice(2, 35), lenderPub: s.slice(36, 69), seedsPub: s.slice(70, 103) };
  try { buildEscrowScript(k); } catch { return null; }
  return k;
}

export const escrowAddress = (rs: Uint8Array) => lockP2shAddress(rs, "TXC");
export const escrowScriptPubKey = (rs: Uint8Array) => lockP2shScriptPubKey(rs);

/** P2PKH address for a public key (e.g. where Seeds' default/liquidation fee lands). */
export function p2pkhAddress(pub: Uint8Array, version: number): string {
  return b58.encode(concat(Uint8Array.of(version), hash160(pub)));
}

/** Output script for a P2PKH address of the given version; throws on anything else. */
export function p2pkhScript(address: string, version: number): Uint8Array {
  const raw = b58.decode(address);
  if (raw.length !== 21 || raw[0] !== version) throw new Error(`Not a TXC pocket address: ${address}`);
  return concat(Uint8Array.of(0x76, 0xa9, 0x14), raw.slice(1), Uint8Array.of(0x88, 0xac));
}

export type EscrowCoin = { txid: string; vout: number; value: bigint };
export type EscrowOutput = { script: Uint8Array; value: bigint };

/** Size estimate for a 2-of-3 P2SH spend (two ~73-byte sigs + 105-byte script per input). */
export function escrowTxBytes(inputs: number, outputs: number): number {
  return 10 + inputs * 298 + outputs * 34;
}

/** Final (non-RBF) spend of every given coin. Outputs with value 0 are dropped. */
export function buildEscrowTx(coins: EscrowCoin[], outputs: EscrowOutput[]): Tx {
  if (!coins.length) throw new Error("No coins in the lockbox");
  const outs = outputs.filter((o) => o.value > 0n);
  if (!outs.length) throw new Error("Nothing to pay out");
  const totalIn = coins.reduce((n, c) => n + c.value, 0n);
  const totalOut = outs.reduce((n, o) => n + o.value, 0n);
  if (totalOut > totalIn) throw new Error("Payout is bigger than the lockbox");
  return {
    version: 1,
    inputs: coins.map((c) => ({ txid: c.txid, vout: c.vout, sequence: 0xffffffff })),
    outputs: outs.map((o) => ({ value: o.value, script: o.script })),
    locktime: 0,
  };
}

export const escrowSighash = (tx: Tx, index: number, rs: Uint8Array) => legacySighash(tx, index, rs);

export function signEscrowInput(tx: Tx, index: number, rs: Uint8Array, privateKey: Uint8Array): Uint8Array {
  const der = secp256k1.sign(escrowSighash(tx, index, rs), privateKey, { prehash: false, format: "der", lowS: true });
  return concat(der, Uint8Array.of(SIGHASH_ALL));
}

export function verifyEscrowSig(tx: Tx, index: number, rs: Uint8Array, sigWithType: Uint8Array, pub: Uint8Array): boolean {
  if (sigWithType.length < 9 || sigWithType[sigWithType.length - 1] !== SIGHASH_ALL) return false;
  try {
    return secp256k1.verify(sigWithType.slice(0, -1), escrowSighash(tx, index, rs), pub, { prehash: false, format: "der", lowS: true });
  } catch { return false; }
}

const push = (d: Uint8Array) => (d.length < 0x4c ? concat(Uint8Array.of(d.length), d) : concat(Uint8Array.of(0x4c, d.length), d));

/**
 * Put two signatures per input into the transaction. OP_CHECKMULTISIG needs them in key order
 * (borrower, lender, Seeds) plus a leading OP_0; every signature is checked before it goes in.
 */
export function finalizeEscrowTx(tx: Tx, rs: Uint8Array, sigs: Array<Partial<Record<EscrowRole, Uint8Array>>>): string {
  const keys = parseEscrowScript(rs);
  if (!keys) throw new Error("Not a Seeds lockbox script");
  if (sigs.length !== tx.inputs.length) throw new Error("One signature pair per input");
  const pubOf: Record<EscrowRole, Uint8Array> = { borrower: keys.borrowerPub, lender: keys.lenderPub, seeds: keys.seedsPub };
  const signed: Tx = {
    ...tx,
    inputs: tx.inputs.map((inp, i) => {
      const s = sigs[i]!;
      const ordered = ROLE_ORDER.filter((r) => s[r]);
      if (ordered.length !== 2) throw new Error("Each input needs exactly two signatures");
      for (const r of ordered) if (!verifyEscrowSig(tx, i, rs, s[r]!, pubOf[r])) throw new Error(`The ${r} signature doesn't check out`);
      return { ...inp, scriptSig: concat(Uint8Array.of(0x00), ...ordered.map((r) => push(s[r]!)), push(rs)) };
    }),
  };
  return bytesToHex(serializeTx(signed));
}
