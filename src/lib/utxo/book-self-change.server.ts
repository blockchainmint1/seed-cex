/**
 * Blockbook coin list for sends, with the pocket's own waiting change counted
 * (rules in book-self-change.ts, tested). Server-only.
 */
import { bookCoinsWithOwnChange, waitingTxids, type BookTx, type BookUtxoRow } from "@/lib/utxo/book-self-change";

/**
 * `base` = a Blockbook /api/v2 URL. Returns null when the coin list can't be read.
 * A transaction that can't be looked up just doesn't count yet.
 */
export async function bookSpendableRows(chain: string, base: string, headers: HeadersInit, address: string): Promise<BookUtxoRow[] | null> {
  const get = async <T>(path: string): Promise<T | null> => {
    try {
      const res = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(10_000) });
      return res.ok ? ((await res.json()) as T) : null;
    } catch {
      return null;
    }
  };
  const rows = await get<BookUtxoRow[]>(`/utxo/${encodeURIComponent(address)}`);
  if (!Array.isArray(rows)) return null;
  const { seedsMadeAmong } = await import("@/lib/utxo/seeds-made.server");
  const made = await seedsMadeAmong(chain, waitingTxids(rows));
  const ids = waitingTxids(rows);
  const txs: Record<string, BookTx | null> = {};
  await Promise.all(ids.map(async (id) => { txs[id] = await get<BookTx>(`/tx/${id}`); }));
  return bookCoinsWithOwnChange(rows, txs, address, made);
}
