/**
 * Blockbook coin lists (Litecoin, Bitcoin, Dogecoin, Bitcoin Cash) with the pocket's own
 * change counted while it waits for a block. Pure, tested.
 *
 * Same rule as TXC/ISK (selfChangeCoins in explorer-rules.ts, Mati's bug Nov 23 2026):
 * coins the pocket sent back to itself are the member's and can't be taken back by
 * anyone else, so a second order, send or swap right after a first one isn't refused
 * for "not enough". Coins from anyone else still need a block. There is no Seeds node
 * for these coins, so Blockbook's own transaction details decide it: every input must
 * come from this same address, and the output must match the coin list exactly.
 */
export type BookUtxoRow = { txid: string; vout: number; value: string; height?: number; confirmations?: number };
export type BookTx = {
  txid?: unknown;
  vin?: Array<{ txid?: unknown; vout?: unknown; addresses?: unknown; isAddress?: unknown; coinbase?: unknown }>;
  vout?: Array<{ n?: unknown; value?: unknown; addresses?: unknown; isAddress?: unknown }>;
};

/** Most waiting transactions one read looks up; more than that counts confirmed coins only. */
export const MAX_BOOK_CHANGE_TXS = 10;

const TXID = /^[0-9a-f]{64}$/i;
const DIGITS = /^\d+$/;

function confirmed(r: BookUtxoRow): boolean {
  return (typeof r.height === "number" && r.height > 0) || (typeof r.confirmations === "number" && r.confirmations >= 1);
}

const onlyThis = (addresses: unknown, address: string) =>
  Array.isArray(addresses) && addresses.length === 1 && addresses[0] === address;

/** Transactions worth looking up: unconfirmed coins at this address (at most MAX_BOOK_CHANGE_TXS). */
export function waitingTxids(rows: BookUtxoRow[]): string[] {
  const ids = [...new Set(rows.filter((r) => !confirmed(r) && typeof r.txid === "string" && TXID.test(r.txid)).map((r) => r.txid.toLowerCase()))];
  return ids.length > MAX_BOOK_CHANGE_TXS ? [] : ids;
}

/**
 * The coins a send may use: confirmed coins, plus unconfirmed ones whose transaction
 * (looked up in `txs`) was paid for entirely from this address. A confirmed coin that
 * one of those transactions already spends is left out, so nothing counts twice.
 */
export function bookCoinsWithOwnChange(rows: BookUtxoRow[], txs: Record<string, BookTx | null | undefined>, address: string): BookUtxoRow[] {
  const own: BookUtxoRow[] = [];
  const spent = new Set<string>();
  for (const r of rows) {
    if (confirmed(r)) continue;
    const tx = typeof r.txid === "string" ? txs[r.txid.toLowerCase()] : null;
    if (!tx || !Array.isArray(tx.vin) || tx.vin.length === 0 || !Array.isArray(tx.vout)) continue;
    const allMine = tx.vin.every((i) => i && i.coinbase === undefined && i.isAddress === true && onlyThis(i.addresses, address)
      && typeof i.txid === "string" && TXID.test(i.txid) && Number.isInteger(i.vout));
    if (!allMine) continue;
    const out = tx.vout.find((o) => o && o.n === r.vout);
    if (!out || out.isAddress !== true || !onlyThis(out.addresses, address)) continue;
    if (typeof out.value !== "string" || !DIGITS.test(out.value) || out.value !== String(r.value) || out.value === "0") continue;
    own.push(r);
    for (const i of tx.vin) spent.add(`${String(i.txid).toLowerCase()}:${i.vout}`);
  }
  const kept = rows.filter((r) => confirmed(r) && !spent.has(`${r.txid.toLowerCase()}:${r.vout}`));
  return [...kept, ...own];
}
