/**
 * Reads the coins on their way to a pocket (rules: arriving.ts, tested). Display only —
 * never used for balances, set-asides or sends. Every reader returns 0 when the network
 * can't be asked, so a slow explorer never breaks a balance screen. Server-only.
 */
import { MAX_ARRIVING_TXS, arrivingFromTxs, flatFromBlockbook, flatFromEsplora, type FlatTx } from "@/lib/account/arriving";
import { waitingTxids, type BookUtxoRow } from "@/lib/utxo/book-self-change";
import { EXPLORER_BASE, type ExplorerChain } from "@/lib/utxo/explorer-rules";

async function getJson<T>(url: string, headers: HeadersInit, timeoutMs = 6_000): Promise<T | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** TXC / ISK: the explorer lists an address's waiting transactions first. */
export async function esploraArriving(chain: ExplorerChain, address: string, omniTxids: ReadonlySet<string> = new Set()): Promise<number> {
  const list = await getJson<unknown[]>(`${EXPLORER_BASE[chain]}/api/address/${encodeURIComponent(address)}/txs`, {
    accept: "application/json",
    "User-Agent": "seeds-exchange/1.0",
  });
  if (!Array.isArray(list)) return 0;
  // The explorer leaves out Omni's data output, so the node's pending Omni list marks TSD payments.
  const waiting = list.map(flatFromEsplora).filter((t): t is FlatTx => t !== null).map((t) => (omniTxids.has(t.txid) ? { ...t, omni: true } : t));
  return arrivingFromTxs(waiting, address);
}

/** Bitcoin, Litecoin, Dogecoin, Bitcoin Cash, Zcash, Dash: Blockbook's coin list, then each waiting transaction. */
export async function blockbookArriving(base: string, headers: HeadersInit, address: string): Promise<number> {
  const rows = await getJson<BookUtxoRow[]>(`${base}/utxo/${encodeURIComponent(address)}`, headers, 8_000);
  if (!Array.isArray(rows)) return 0;
  const ids = waitingTxids(rows).slice(0, MAX_ARRIVING_TXS);
  if (!ids.length) return 0;
  const txs = await Promise.all(ids.map((id) => getJson<unknown>(`${base}/tx/${id}`, headers)));
  const waiting = txs.map(flatFromBlockbook).filter((t): t is FlatTx => t !== null);
  return arrivingFromTxs(waiting, address);
}
