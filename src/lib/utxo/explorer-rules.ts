/**
 * Public mempool.space-style explorers for TXC and ISK. Pure: no I/O.
 *
 * Both run an address index, so one address lookup is a quick indexed read that
 * can run many at once, unlike the node's scantxoutset (one full UTXO-set scan at
 * a time). Display reads use the explorer first. TXC sends use Seeds' own TXC
 * indexer only after every coin is double-checked with our node (checkCoinsAgainstNode).
 */
import { ripemd160 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

export const EXPLORER_BASE = {
  txc: "https://mempool.texitcoin.org",
  isk: "https://mempool.iskandercoin.com",
} as const;
export type ExplorerChain = keyof typeof EXPLORER_BASE;

export type ExplorerUtxo = { txid: string; vout: number; scriptPubKey: string; amount: number; height: number };

const TXID = /^[0-9a-f]{64}$/i;

/**
 * Turn an explorer `/api/address/{a}/utxo` reply into coins. Confirmed coins only,
 * matching the node's scantxoutset. Any malformed row rejects the whole reply, so
 * a bad answer reads as "couldn't read" rather than a wrong balance.
 */
export function parseExplorerUtxos(rows: unknown, scriptPubKey: string): ExplorerUtxo[] {
  if (!Array.isArray(rows)) throw new Error("Explorer reply was not a list");
  const out: ExplorerUtxo[] = [];
  for (const r of rows as Array<Record<string, unknown>>) {
    const status = (r?.status ?? {}) as { confirmed?: unknown; block_height?: unknown };
    const ok =
      typeof r?.txid === "string" && TXID.test(r.txid) &&
      Number.isInteger(r.vout) && (r.vout as number) >= 0 &&
      Number.isSafeInteger(r.value) && (r.value as number) >= 0;
    if (!ok) throw new Error("Explorer reply had a malformed coin");
    if (status.confirmed !== true) continue;
    out.push({
      txid: r.txid as string,
      vout: r.vout as number,
      scriptPubKey,
      amount: (r.value as number) / 1e8,
      height: typeof status.block_height === "number" ? status.block_height : 0,
    });
  }
  return out;
}

/** Largest coin list the TXC indexer returns in one reply; a longer list is marked x-truncated. */
export const EXPLORER_UTXO_LIMIT = 5000;

/**
 * May a send (coin picking, P2P reserve, settlement) use the TXC indexer's coin list
 * instead of our node's full scan? Only when the indexer has caught up with our own
 * node's tip and the list is complete. The indexer (Seeds' own TXC mempool stack) is
 * fronted by a 5-second cache that can serve a stale copy when it errors; a stale copy
 * shows an old indexed tip, so this check also catches that. Our node still validates
 * every input when the send is broadcast.
 */
export function indexerUsableForSend(i: { indexedTip: number | null; nodeTip: number | null; truncated: boolean }): boolean {
  if (i.truncated) return false;
  if (i.indexedTip === null || i.nodeTip === null) return false;
  if (!Number.isSafeInteger(i.indexedTip) || !Number.isSafeInteger(i.nodeTip) || i.indexedTip < 0) return false;
  return i.indexedTip >= i.nodeTip;
}

/** Parse the indexer's /api/address/_status reply into its indexed tip, or null. */
export function parseIndexedTip(body: unknown): number | null {
  const b = body as { ok?: unknown; indexed_tip?: unknown } | null;
  if (!b || b.ok !== true || !Number.isSafeInteger(b.indexed_tip) || (b.indexed_tip as number) < 0) return null;
  return b.indexed_tip as number;
}

/** Most indexer coins one send will double-check with our node; a bigger pocket uses the node scan. */
export const MAX_COINS_TO_VERIFY = 500;

/** Our node's `gettxout txid vout true` answer: null = spent (even in the mempool) or never existed. */
export type NodeCoin = { value: number; confirmations: number; scriptPubKey: { hex: string } } | null;

type CoinLike = { txid: string; vout: number; scriptPubKey: string; amount: number };

export type CoinCheck<C extends CoinLike = ExplorerUtxo> =
  | { kind: "ok"; coins: C[] }
  /** The indexer said something our node contradicts: never use its list. */
  | { kind: "mismatch"; reason: string }
  /** Our node didn't answer for some coin: use the node scan. */
  | { kind: "unknown" };

const sats = (coins: number) => Math.round(coins * 1e8);

/**
 * Compare every indexer coin with our own node before it can be spent. A coin's size
 * and owner script must match exactly (an understated size would otherwise turn into
 * miner fee, since legacy signatures don't cover input amounts). Coins our node says
 * are spent, unknown or unconfirmed are dropped — that can only lower a balance.
 * `unconfirmedOk` keeps 0-confirmation coins (the pocket's own change, see selfChangeCoins).
 */
export function checkCoinsAgainstNode<C extends CoinLike>(coins: C[], replies: Array<NodeCoin | Error>, opts: { unconfirmedOk?: boolean } = {}): CoinCheck<C> {
  if (replies.length !== coins.length) return { kind: "unknown" };
  const ok: C[] = [];
  for (let i = 0; i < coins.length; i++) {
    const coin = coins[i]!;
    const r = replies[i];
    if (r instanceof Error || r === undefined) return { kind: "unknown" };
    if (r === null) continue;
    if (typeof r.value !== "number" || !Number.isFinite(r.value) || typeof r.scriptPubKey?.hex !== "string") return { kind: "unknown" };
    if (sats(r.value) !== sats(coin.amount)) return { kind: "mismatch", reason: `${coin.txid}:${coin.vout} is ${r.value} on our node, ${coin.amount} on the indexer` };
    if (r.scriptPubKey.hex.toLowerCase() !== coin.scriptPubKey.toLowerCase()) return { kind: "mismatch", reason: `${coin.txid}:${coin.vout} belongs to a different address on our node` };
    // unconfirmedOk: only for the pocket's own change (selfChangeCoins), never other coins.
    if (!(r.confirmations >= 1) && !(opts.unconfirmedOk && r.confirmations === 0)) continue;
    ok.push({ ...coin, amount: sats(r.value) / 1e8 });
  }
  return { kind: "ok", coins: ok };
}

/** The fast list doesn't hold what the send needs: recheck with the node scan before saying "not enough". */
export function fastListShort(coins: Array<{ amount: number }>, atLeast: number | undefined): boolean {
  if (!atLeast || !(atLeast > 0)) return false;
  return coins.reduce((s, c) => s + sats(c.amount), 0) < sats(atLeast);
}

/**
 * Bug from Mati (Nov 23 2026): a TSD payment spent his one 1,000 TXC coin to pay a tiny
 * network fee, and the 999.99 TXC change sat waiting for a block for ~6 minutes. Seeds
 * only counted confirmed coins, so his pocket read as 0.0001 TXC and his sell order was
 * refused. Change the pocket sent to itself can't be taken back by anyone else, so it
 * counts — but only when our own node shows every input of that transaction was signed
 * by this same address. Coins from anyone else still wait for a block.
 */

/** Our node's `getrawtransaction txid true` answer for a mempool transaction. */
export type NodeTx = {
  txid?: unknown;
  vin?: Array<{ coinbase?: unknown; ismweb?: unknown; scriptSig?: { asm?: unknown } }>;
  vout?: Array<{ n?: unknown; value?: unknown; ismweb?: unknown; scriptPubKey?: { hex?: unknown } }>;
};

/** Most mempool transactions one balance read will look through; a busier mempool counts confirmed coins only. */
export const MAX_MEMPOOL_TXS_TO_CHECK = 300;

const P2PKH_SCRIPT = /^76a914([0-9a-f]{40})88ac$/;
const PUBKEY_HEX = /^(0[23][0-9a-f]{64}|04[0-9a-f]{128})$/;
const SIG_ALL = /^[0-9a-fA-F]{16,146}\[ALL\]$/;

/** The 20-byte key hash inside a pay-to-address script, or null for any other script. */
export function p2pkhHashOf(scriptHex: string): string | null {
  return P2PKH_SCRIPT.exec(scriptHex.toLowerCase())?.[1] ?? null;
}

function hash160Hex(pubkeyHex: string): string {
  return bytesToHex(ripemd160(sha256(hexToBytes(pubkeyHex))));
}

/** Did this one address sign every input? (P2PKH signature + key, no coinbase, no MWEB.) */
function signedOnlyBy(tx: NodeTx, ownHash: string): boolean {
  if (!Array.isArray(tx.vin) || tx.vin.length === 0) return false;
  for (const i of tx.vin) {
    if (!i || i.coinbase !== undefined || i.ismweb === true) return false;
    const asm = i.scriptSig?.asm;
    if (typeof asm !== "string") return false;
    const parts = asm.trim().split(" ");
    if (parts.length !== 2) return false;
    const [sig, key] = parts as [string, string];
    if (!SIG_ALL.test(sig) || !PUBKEY_HEX.test(key.toLowerCase())) return false;
    if (hash160Hex(key.toLowerCase()) !== ownHash) return false;
  }
  return true;
}

/**
 * Outputs paying `scriptHex` in mempool transactions whose every input this same address
 * signed (its own change). Amounts here are only a starting point: the caller re-reads
 * each one with gettxout before it counts (checkCoinsAgainstNode with unconfirmedOk).
 */
export function selfChangeCoins(txs: NodeTx[], scriptHex: string): Array<{ txid: string; vout: number; scriptPubKey: string; amount: number; height: number }> {
  const script = scriptHex.toLowerCase();
  const ownHash = p2pkhHashOf(script);
  if (!ownHash) return [];
  const out: Array<{ txid: string; vout: number; scriptPubKey: string; amount: number; height: number }> = [];
  for (const tx of txs) {
    if (!tx || typeof tx.txid !== "string" || !TXID.test(tx.txid) || !Array.isArray(tx.vout)) continue;
    const mine = tx.vout.filter((o) => o && o.ismweb !== true && typeof o.scriptPubKey?.hex === "string" && o.scriptPubKey.hex.toLowerCase() === script);
    if (!mine.length || !signedOnlyBy(tx, ownHash)) continue;
    for (const o of mine) {
      if (!Number.isInteger(o.n) || (o.n as number) < 0 || typeof o.value !== "number" || !Number.isFinite(o.value) || o.value <= 0) continue;
      out.push({ txid: tx.txid.toLowerCase(), vout: o.n as number, scriptPubKey: script, amount: sats(o.value) / 1e8, height: 0 });
    }
  }
  return out;
}

/** Add coins to a list without counting the same coin twice. */
export function mergeCoins<C extends { txid: string; vout: number }>(base: C[], extra: C[]): C[] {
  const seen = new Set(base.map((c) => `${c.txid.toLowerCase()}:${c.vout}`));
  const out = [...base];
  for (const c of extra) {
    const k = `${c.txid.toLowerCase()}:${c.vout}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}
