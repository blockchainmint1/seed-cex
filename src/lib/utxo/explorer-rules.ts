/**
 * Public mempool.space-style explorers for TXC and ISK. Pure: no I/O.
 *
 * Both run an address index, so one address lookup is a quick indexed read that
 * can run many at once, unlike the node's scantxoutset (one full UTXO-set scan at
 * a time). Display reads use the explorer first. TXC sends use Seeds' own TXC
 * indexer only after every coin is double-checked with our node (checkCoinsAgainstNode).
 */
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
 */
export function checkCoinsAgainstNode<C extends CoinLike>(coins: C[], replies: Array<NodeCoin | Error>): CoinCheck<C> {
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
    if (!(r.confirmations >= 1)) continue;
    ok.push({ ...coin, amount: sats(r.value) / 1e8 });
  }
  return { kind: "ok", coins: ok };
}

/** The fast list doesn't hold what the send needs: recheck with the node scan before saying "not enough". */
export function fastListShort(coins: Array<{ amount: number }>, atLeast: number | undefined): boolean {
  if (!atLeast || !(atLeast > 0)) return false;
  return coins.reduce((s, c) => s + sats(c.amount), 0) < sats(atLeast);
}
