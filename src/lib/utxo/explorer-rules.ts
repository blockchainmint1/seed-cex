/**
 * Public mempool.space-style explorers for TXC and ISK. Pure: no I/O.
 *
 * Both run an address index, so one address lookup is a quick indexed read that
 * can run many at once, unlike the node's scantxoutset (one full UTXO-set scan at
 * a time). Display reads use the explorer first; sends and settlement keep the
 * node first and use the explorer only when the node is down.
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
