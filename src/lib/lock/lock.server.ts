/**
 * Locked trading balance — server side (TXC/ISK node I/O, Seeds key, co-sign ledger).
 * Pure rules live in ./script.ts and ./rules.ts; this file only wires them to the node and
 * database. Not yet reachable from any route: it is used by the operator live test until
 * HME Wallet can sign lock inputs (docs/locked-trading-balance-spec.md).
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { rpc, type RpcChain } from "@/lib/rpc.server";
import {
  COOP_SEQUENCE, buildLockScript, deriveSeedsLockKey, finalizeLockTx, lockAddressFor, lockScriptPubKeyFor,
  parseLockScript, parseUnsignedTx, refundSequence, serializeTx, signLock, verifyLock,
  type LockChain, type LockWrapper, type Tx,
} from "./script";
import { checkLockSpend, type ExpectedSpend, type LockUtxo, type OmniDecoded, type SpendPurpose } from "./rules";

const rpcChain = (c: LockChain): RpcChain => (c === "TXC" ? "txc" : "isk");
const SATS = 100_000_000;
export const LOCK_SPEND_FEE = 0.001; // TXC, same carrier fee as other Omni sends

/** Seeds' half for one member. Auditor: move to KMS/HSM signing before launch. */
export function seedsLockKey(memberId: string, chain: LockChain, generation = 0) {
  const m = process.env.SEEDS_LOCK_MASTER;
  if (!m) throw new Error("SEEDS_LOCK_MASTER is not configured");
  return deriveSeedsLockKey(new TextEncoder().encode(m), memberId, chain, generation);
}

export type LockDescriptor = { chain: LockChain; wrapper: LockWrapper; ws: Uint8Array; address: string; csvBlocks: number };
export function describeLock(chain: LockChain, wrapper: LockWrapper, seedsPub: Uint8Array, memberPub: Uint8Array, csvBlocks: number): LockDescriptor {
  const ws = buildLockScript({ seedsPub, memberPub, csvBlocks });
  return { chain, wrapper, ws, address: lockAddressFor(ws, chain, wrapper), csvBlocks };
}

/** Coins at the lock with confirmation counts (scantxoutset = confirmed chainstate only). */
export async function lockCoins(chain: LockChain, address: string): Promise<(LockUtxo & { scriptPubKey: string; amount: number })[]> {
  const c = rpcChain(chain);
  const [scan, tip] = await Promise.all([
    rpc<{ success: boolean; unspents: { txid: string; vout: number; scriptPubKey: string; amount: number; height: number }[] }>(c, "scantxoutset", ["start", [`addr(${address})`]], 60_000),
    rpc<number>(c, "getblockcount"),
  ]);
  if (!scan.success) throw new Error("Could not scan the lock address");
  return scan.unspents.map((u) => ({
    txid: u.txid, vout: u.vout, scriptPubKey: u.scriptPubKey, amount: u.amount,
    value: BigInt(Math.round(u.amount * SATS)), confirmations: u.height > 0 ? tip - u.height + 1 : 0,
  }));
}

async function walletPath(chain: LockChain) {
  const w = await rpc<string[]>(rpcChain(chain), "listwallets");
  if (!w.length) throw new Error("Node has no wallet loaded for Omni decoding");
  return `/wallet/${encodeURIComponent(w[0]!)}`;
}

export async function omniDecode(chain: LockChain, rawHex: string, prevtxs: { txid: string; vout: number; scriptPubKey: string; value: number }[]): Promise<OmniDecoded | null> {
  try {
    return await rpc<OmniDecoded>(rpcChain(chain), "omni_decodetransaction", [rawHex, prevtxs], 12_000, await walletPath(chain));
  } catch (e) {
    console.warn("[lock] omni decode failed", (e as Error).message);
    return null;
  }
}

export type BuiltLockSpend = { tx: Tx; unsignedHex: string; unsignedSha256: string; coins: LockUtxo[]; expected: ExpectedSpend; decoded: OmniDecoded | null };

/** Seeds builds every lock spend itself: sweep all confirmed coins, Omni send, change back to the lock. */
export async function buildLockSpend(lock: LockDescriptor, p: { purpose: SpendPurpose; toAddress?: string; propertyId?: number; amount?: string }): Promise<BuiltLockSpend> {
  const c = rpcChain(lock.chain);
  const all = await lockCoins(lock.chain, lock.address);
  const coins = all.filter((u) => u.confirmations >= 1);
  if (!coins.length) throw new Error("No confirmed coins at the lock yet");
  const prevtxs = coins.map((u) => ({ txid: u.txid, vout: u.vout, scriptPubKey: u.scriptPubKey, value: u.amount }));
  let raw = await rpc<string>(c, "createrawtransaction", [coins.map((u) => ({ txid: u.txid, vout: u.vout, sequence: COOP_SEQUENCE })), []]);
  if (p.purpose !== "refresh") {
    if (!p.toAddress || p.propertyId == null || !p.amount) throw new Error("Recipient, token and amount are required");
    const payload = await rpc<string>(c, "omni_createpayload_simplesend", [p.propertyId, p.amount]);
    raw = await rpc<string>(c, "omni_createrawtx_opreturn", [raw, payload]);
    raw = await rpc<string>(c, "omni_createrawtx_reference", [raw, p.toAddress]);
  }
  raw = await rpc<string>(c, "omni_createrawtx_change", [raw, prevtxs, lock.address, LOCK_SPEND_FEE]);
  const tx = parseUnsignedTx(raw);
  const toScript = p.toAddress ? hexToBytes((await rpc<{ scriptPubKey: string }>(c, "validateaddress", [p.toAddress])).scriptPubKey) : undefined;
  const expected: ExpectedSpend = {
    purpose: p.purpose, lockScriptPubKey: lockScriptPubKeyFor(lock.ws, lock.wrapper), toScriptPubKey: toScript,
    lockAddress: lock.address, toAddress: p.toAddress, propertyId: p.propertyId, amount: p.amount,
  };
  const decoded = p.purpose === "refresh" ? null : await omniDecode(lock.chain, raw, prevtxs);
  const errors = checkLockSpend(tx, all, expected, decoded);
  if (errors.length) throw new Error(`Seeds refused to build this lock spend: ${errors.join("; ")}`);
  return { tx, unsignedHex: raw, unsignedSha256: bytesToHex(sha256(hexToBytes(raw))), coins, expected, decoded };
}

/** Verify the member's signature for every input of a Seeds-built spend. */
export function memberSigsValid(lock: LockDescriptor, built: BuiltLockSpend, memberSigs: Uint8Array[]): boolean {
  const terms = parseLockScript(lock.ws);
  if (!terms || memberSigs.length !== built.tx.inputs.length) return false;
  return built.tx.inputs.every((_, i) => verifyLock({ tx: built.tx, index: i, ws: lock.ws, value: built.coins.find((c) => c.txid === built.tx.inputs[i]!.txid && c.vout === built.tx.inputs[i]!.vout)!.value, wrapper: lock.wrapper }, memberSigs[i]!, terms.memberPub));
}

/** Seeds adds its half (after the ledger reservation) and returns the broadcastable hex. */
export function addSeedsHalf(lock: LockDescriptor, built: BuiltLockSpend, memberSigs: Uint8Array[], seedsPriv: Uint8Array): string {
  const sigs = built.tx.inputs.map((inp, i) => {
    const value = built.coins.find((c) => c.txid === inp.txid && c.vout === inp.vout)!.value;
    return { member: memberSigs[i]!, seeds: signLock({ tx: built.tx, index: i, ws: lock.ws, value, wrapper: lock.wrapper }, seedsPriv) };
  });
  return finalizeLockTx(built.tx, lock.ws, lock.wrapper, sigs);
}

/** All-or-nothing: every tx must pass testmempoolaccept before any is sent. */
export async function broadcastTogether(chain: LockChain, hexes: string[]): Promise<string[]> {
  const c = rpcChain(chain);
  const res = await rpc<{ allowed: boolean; "reject-reason"?: string }[]>(c, "testmempoolaccept", [hexes]);
  const bad = res.find((r) => !r.allowed);
  if (bad) throw new Error(`The node rejected the settlement: ${bad["reject-reason"] ?? "unknown"}`);
  const out: string[] = [];
  for (const h of hexes) out.push(await rpc<string>(c, "sendrawtransaction", [h]));
  return out;
}

/** Record proposals, then reserve every input in one statement; false = a coin was already co-signed. */
export async function reserveForSigning(rows: { lockId: string; built: BuiltLockSpend; purpose: SpendPurpose; toAddress: string; propertyId?: number; amount?: string; tradeId?: string; pairId?: string }[]): Promise<{ ok: boolean; spendIds: string[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("lock_spends").insert(rows.map((r) => ({
    lock_id: r.lockId, purpose: r.purpose, trade_id: r.tradeId ?? null, pair_id: r.pairId ?? null, to_address: r.toAddress,
    property_id: r.propertyId ?? null, amount: r.amount ?? null, unsigned_hex: r.built.unsignedHex, unsigned_sha256: r.built.unsignedSha256,
    inputs: r.built.tx.inputs.map((i) => ({ txid: i.txid, vout: i.vout })), expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  }))).select("id");
  if (error || !data) throw new Error(`Could not record the lock spend: ${error?.message}`);
  const spendIds = data.map((d) => d.id);
  const { data: ok, error: e2 } = await supabaseAdmin.rpc("reserve_lock_outpoints", { _spend_ids: spendIds });
  if (e2) throw new Error(`Could not reserve coins: ${e2.message}`);
  const { count } = await supabaseAdmin.from("lock_spends").select("id", { count: "exact", head: true }).in("id", spendIds).eq("status", "signed");
  if (!ok || count !== spendIds.length) {
    await supabaseAdmin.from("lock_spends").update({ status: "refused", error: "coin already co-signed", updated_at: new Date().toISOString() }).in("id", spendIds).eq("status", "proposed");
    return { ok: false, spendIds };
  }
  return { ok: true, spendIds };
}

/** Member-only refund (no Seeds): what HME Wallet's "Recover locked funds" button builds. */
export async function buildRefund(lock: LockDescriptor, p: { toAddress: string; propertyId: number; amount: string }, memberPriv: Uint8Array): Promise<string> {
  const c = rpcChain(lock.chain);
  const coins = (await lockCoins(lock.chain, lock.address)).filter((u) => u.confirmations >= lock.csvBlocks);
  if (!coins.length) throw new Error(`No coin at the lock is ${lock.csvBlocks} blocks old yet`);
  const prevtxs = coins.map((u) => ({ txid: u.txid, vout: u.vout, scriptPubKey: u.scriptPubKey, value: u.amount }));
  let raw = await rpc<string>(c, "createrawtransaction", [coins.map((u) => ({ txid: u.txid, vout: u.vout, sequence: refundSequence(lock.csvBlocks) })), []]);
  raw = await rpc<string>(c, "omni_createrawtx_opreturn", [raw, await rpc<string>(c, "omni_createpayload_simplesend", [p.propertyId, p.amount])]);
  raw = await rpc<string>(c, "omni_createrawtx_reference", [raw, p.toAddress]);
  raw = await rpc<string>(c, "omni_createrawtx_change", [raw, prevtxs, p.toAddress, LOCK_SPEND_FEE]);
  const tx = parseUnsignedTx(raw);
  if (tx.version < 2) throw new Error("Refund needs transaction version 2");
  const sigs = tx.inputs.map((inp, i) => ({ member: signLock({ tx, index: i, ws: lock.ws, value: coins.find((u) => u.txid === inp.txid && u.vout === inp.vout)!.value, wrapper: lock.wrapper }, memberPriv) }));
  return finalizeLockTx(tx, lock.ws, lock.wrapper, sigs);
}

export { serializeTx };
