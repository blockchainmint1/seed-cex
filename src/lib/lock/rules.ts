/**
 * Locked trading balance — settlement rules (pure, tested). The auditor's conditions
 * (2026-11-17 design review) are encoded here so the server path can't skip them:
 *  - member deposits into a lock become tradable only after a confirmation depth scaled by value
 *  - tokens already promised by signed-but-unconfirmed spends are not tradable again
 *  - every spend sweeps EVERY confirmed coin at the lock (one forgotten old dust coin would
 *    let the member refund the whole token balance alone), spends only confirmed coins
 *    (P2SH txids are malleable until mined), keeps a TXC fee reserve at the lock, and has
 *    exactly the outputs Seeds expects
 *  - Seeds co-signs only a transaction it built, whose Omni decode matches the trade.
 */
import { bytesToHex } from "@noble/hashes/utils.js";
import { COOP_SEQUENCE, LOCK_CSV_BLOCKS, LOCK_SAFETY_MARGIN, lockStrength, type Tx } from "./script";

/** 0.01 TXC stays at every lock so the member's refund always has a coin to pay its fee. */
export const FEE_RESERVE_SATS = 1_000_000n;
/** TXC sent along with a member's first lock deposit (covers many spends + the reserve). */
export const LOCK_FUNDING_SATS = 5_000_000n;
/** Seeds refuses to co-sign a lock spend paying more than 0.005 TXC in miner fee. */
export const MAX_LOCK_FEE_SATS = 500_000n;

/** Confirmations before a member's own deposit into the lock is tradable. */
export function depositConfirmationsRequired(usd: number): number {
  if (!Number.isFinite(usd) || usd < 0) throw new Error("Bad deposit value");
  if (usd <= 1_000) return 6;
  if (usd <= 10_000) return 12;
  return 24;
}

export type LockDeposit = { amount: bigint; confirmations: number; usd: number; /** came from another Seeds lock (a co-signed trade) */ fromLock: boolean };

/**
 * Raw token units Seeds may settle from right now. Co-signed trade receipts count once
 * confirmed (no one can double-spend them alone); member deposits wait for depth.
 */
export function tradableAmount(confirmedBalance: bigint, pendingOut: bigint, deposits: LockDeposit[]): bigint {
  const immature = deposits
    .filter((d) => !d.fromLock && d.confirmations < depositConfirmationsRequired(d.usd))
    .reduce((s, d) => s + d.amount, 0n);
  const t = confirmedBalance - pendingOut - immature;
  return t > 0n ? t : 0n;
}

export type LockUtxo = { txid: string; vout: number; value: bigint; confirmations: number };
export type SpendPurpose = "trade" | "unlock" | "refresh";
export type ExpectedSpend = {
  purpose: SpendPurpose;
  lockScriptPubKey: Uint8Array;
  /** Omni reference output (buyer's lock for trades, member's pocket for unlocks). Unused for refresh. */
  toScriptPubKey?: Uint8Array;
  lockAddress: string;
  toAddress?: string;
  propertyId?: number;
  /** Omni decimal string exactly as the node prints it, e.g. "100.00000000" */
  amount?: string;
};
export type OmniDecoded = { sendingaddress?: string; referenceaddress?: string; propertyid?: number; amount?: string; type_int?: number };

const key = (t: { txid: string; vout: number }) => `${t.txid}:${t.vout}`;

/** Every reason Seeds must refuse to co-sign this spend; empty means OK. */
export function checkLockSpend(tx: Tx, coins: LockUtxo[], e: ExpectedSpend, decoded: OmniDecoded | null): string[] {
  const err: string[] = [];
  if (tx.version !== 2 || tx.locktime !== 0) err.push("version/locktime");
  const confirmed = coins.filter((c) => c.confirmations >= 1);
  if (!confirmed.length) err.push("no confirmed coins at the lock");
  const want = new Set(confirmed.map(key));
  const have = new Set(tx.inputs.map(key));
  if (have.size !== tx.inputs.length) err.push("duplicate input");
  if (want.size !== have.size || [...want].some((k) => !have.has(k))) err.push("must spend exactly every confirmed coin at the lock");
  if (tx.inputs.some((i) => i.sequence !== COOP_SEQUENCE)) err.push("inputs must be final (no replace-by-fee)");
  const st = lockStrength(coins.map((c) => c.confirmations), LOCK_CSV_BLOCKS, LOCK_SAFETY_MARGIN);
  if (e.purpose !== "refresh" && st.state === "weak") err.push("lock too old: refresh first");

  const lockHex = bytesToHex(e.lockScriptPubKey);
  const toHex = e.toScriptPubKey ? bytesToHex(e.toScriptPubKey) : null;
  let opReturns = 0, refs = 0, changeOut = 0n, changeCount = 0;
  for (const o of tx.outputs) {
    const h = bytesToHex(o.script);
    if (o.script[0] === 0x6a) { opReturns++; if (o.value !== 0n) err.push("OP_RETURN carries value"); }
    else if (h === lockHex && e.purpose !== "refresh" && toHex !== lockHex) { changeCount++; changeOut += o.value; }
    else if (toHex && h === toHex) refs++;
    else if (e.purpose === "refresh" && h === lockHex) { changeCount++; changeOut += o.value; }
    else err.push("unexpected output");
  }
  const inSum = confirmed.reduce((s, c) => s + c.value, 0n);
  const outSum = tx.outputs.reduce((s, o) => s + o.value, 0n);
  const fee = inSum - outSum;
  if (fee <= 0n || fee > MAX_LOCK_FEE_SATS) err.push("fee out of range");
  if (changeCount !== 1) err.push("exactly one change output back to the lock");
  if (changeOut < FEE_RESERVE_SATS) err.push("would spend the lock's fee reserve");

  if (e.purpose === "refresh") {
    if (opReturns !== 0 || tx.outputs.length !== 1) err.push("refresh must be a single output back to the lock");
  } else {
    if (opReturns !== 1 || refs !== 1) err.push("needs exactly one Omni payload and one reference output");
    if (!decoded) err.push("Omni decode missing");
    else {
      if (decoded.type_int !== 0) err.push("not an Omni simple send");
      if (decoded.sendingaddress !== e.lockAddress) err.push("Omni sender is not the lock");
      if (decoded.referenceaddress !== e.toAddress) err.push("Omni recipient mismatch");
      if (decoded.propertyid !== e.propertyId) err.push("Omni property mismatch");
      if (decoded.amount !== e.amount) err.push("Omni amount mismatch");
    }
  }
  return err;
}

/**
 * Two-leg trades on lock-backed pairs are only settled as a pair (closes audit C2 for
 * TXC-native pairs): both members' signatures must be present and verified before Seeds
 * adds its own to either leg, and both are broadcast together.
 */
export function pairReady(legs: { memberSigsVerified: boolean }[]): boolean {
  return legs.length === 2 && legs.every((l) => l.memberSigsVerified);
}
