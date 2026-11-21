/**
 * UTXO chain I/O for the settlement engine.
 *
 * TXC sends read Seeds' own TXC indexer (mempool.texitcoin.org) first when it has
 * caught up with our node, else our node's scan; ISK sends use our node first.
 * Explorers are the fallback when a node is down; displays read them first.
 * Litecoin has no private node, so it goes through NowNodes' Blockbook
 * indexer. Server-only: every credential is read from the environment inside
 * the call, never at module scope.
 */
import { bytesToHex } from "@noble/hashes/utils.js";
import { getChain, type UtxoChainId } from "@/lib/chains";
import { broadcastRawTx, fetchTxConfirmations, rpc, rpcConfigured, scanAddressUtxos } from "@/lib/rpc.server";
import { addressToScriptFor, type Utxo } from "@/lib/txc/tx.server";
import { EXPLORER_BASE, EXPLORER_UTXO_LIMIT, indexerUsableForSend, parseExplorerUtxos, parseIndexedTip, type ExplorerChain } from "@/lib/utxo/explorer-rules";

const LTC_BOOK = "https://ltcbook.nownodes.io/api/v2";
const DEFAULT_FEE_RATE: Record<UtxoChainId, number> = { txc: 10, ltc: 8, isk: 10 };

function bookHeaders(): HeadersInit {
  return {
    "api-key": process.env.NOWNODES_API_KEY ?? "",
    // Blockbook sits behind a WAF that rejects requests without a UA.
    "User-Agent": "seeds-exchange/1.0",
    accept: "application/json",
  };
}

async function book<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${LTC_BOOK}${path}`, { headers: bookHeaders() });
    if (!res.ok) {
      console.error(`[ltc] blockbook ${path} failed [${res.status}]`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[ltc] blockbook ${path} threw`, err);
    return null;
  }
}

/** Is this chain reachable at all right now? */
export function utxoChainOnline(chain: UtxoChainId): boolean {
  if (chain === "ltc") return Boolean(process.env.NOWNODES_API_KEY);
  return rpcConfigured(chain);
}

export function p2pkhVersionOf(chain: UtxoChainId): number {
  const version = getChain(chain).p2pkhVersion;
  if (version === undefined) throw new Error(`${chain} has no P2PKH version`);
  return version;
}

export function isValidUtxoAddress(chain: UtxoChainId, address: string): boolean {
  try {
    addressToScriptFor(address, p2pkhVersionOf(chain));
    return true;
  } catch {
    return false;
  }
}

/** Spendable outputs at an address. Throws when the chain is unreachable. */
export async function loadUtxosFor(chain: UtxoChainId, address: string): Promise<Utxo[]> {
  if (chain === "ltc") {
    const rows = await book<Array<{ txid: string; vout: number; value: string; height?: number }>>(
      `/utxo/${encodeURIComponent(address)}?confirmed=true`,
    );
    if (!rows) throw new Error("Could not read Litecoin UTXOs (indexer unreachable)");
    const script = bytesToHex(addressToScriptFor(address, p2pkhVersionOf("ltc")));
    return rows.map((r) => ({
      txid: r.txid,
      vout: r.vout,
      scriptPubKey: script,
      amount: Number(r.value) / 1e8,
      height: r.height ?? 0,
    }));
  }

  // TXC: Seeds' own indexer (the TXC mempool stack) answers in ~150 ms; the node's
  // scantxoutset walks the whole coin set (~10 s, one at a time). Used only when it
  // has caught up with our node and the list is complete (indexerUsableForSend).
  if (chain === "txc" && rpcConfigured("txc")) {
    const fast = await loadIndexerUtxosForSend(address);
    if (fast) return fast;
  }

  if (rpcConfigured(chain)) {
    const scan = await scanAddressUtxos(chain, [address]);
    if (scan) {
      return scan.utxos.map((u) => ({
        txid: u.txid,
        vout: u.vout,
        scriptPubKey: u.scriptPubKey,
        amount: u.amount,
        height: u.height,
      }));
    }
  }

  // Public explorer is the TXC/ISK fallback when our node is down.
  return loadExplorerUtxos(chain, address);
}

/** Confirmed coins from the chain's explorer (address index). TXC and ISK only. A cut-off list throws. */
async function loadExplorerUtxos(chain: ExplorerChain, address: string, timeoutMs = 10_000): Promise<Utxo[]> {
  const script = bytesToHex(addressToScriptFor(address, p2pkhVersionOf(chain)));
  const res = await fetch(`${EXPLORER_BASE[chain]}/api/address/${encodeURIComponent(address)}/utxo?limit=${EXPLORER_UTXO_LIMIT}`, {
    headers: { accept: "application/json", "User-Agent": "seeds-exchange/1.0" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Could not read ${getChain(chain).name} coins for ${address}`);
  if (res.headers.get("x-truncated") === "true") throw new Error(`${getChain(chain).name} explorer cut off the coin list for ${address}`);
  return parseExplorerUtxos(await res.json(), script);
}

/** The TXC indexer's own sync height, or null when it can't be read. */
async function txcIndexedTip(): Promise<number | null> {
  try {
    const res = await fetch(`${EXPLORER_BASE.txc}/api/address/_status`, {
      headers: { accept: "application/json", "User-Agent": "seeds-exchange/1.0" },
      signal: AbortSignal.timeout(4_000),
    });
    return res.ok ? parseIndexedTip(await res.json()) : null;
  } catch {
    return null;
  }
}

/**
 * TXC coins for a send, from the indexer, or null to fall back to the node scan.
 * Reads the indexer's height and our node's height alongside the coin list; the
 * list counts only if the indexer has reached our node's tip and isn't cut off.
 */
async function loadIndexerUtxosForSend(address: string): Promise<Utxo[] | null> {
  const [coins, indexedTip, nodeTip] = await Promise.all([
    loadExplorerUtxos("txc", address, 5_000).then(
      (c) => ({ c, truncated: false }),
      (e: Error) => ({ c: null, truncated: /cut off/.test(e.message) }),
    ),
    txcIndexedTip(),
    rpc<number>("txc", "getblockcount", [], 4_000).catch(() => null),
  ]);
  if (!coins.c) return null;
  if (!indexerUsableForSend({ indexedTip, nodeTip, truncated: coins.truncated })) return null;
  return coins.c;
}

/**
 * Coins for showing a balance or watching for deposits — never for picking coins
 * to send. TXC and ISK read the explorer's address index first (~150 ms, many at
 * once) and fall back to our node's full scan (scantxoutset walks the whole coin
 * set — 18M+ outputs on TXC, ~10 s, one at a time); Litecoin is the same as loadUtxosFor.
 */
export async function loadDisplayUtxosFor(chain: UtxoChainId, address: string): Promise<Utxo[]> {
  if (chain === "isk" || chain === "txc") {
    try {
      return await loadExplorerUtxos(chain, address);
    } catch (err) {
      console.error(`[${chain}] explorer read failed, using node`, (err as Error).message);
    }
  }
  return loadUtxosFor(chain, address);
}

export async function broadcastFor(chain: UtxoChainId, hex: string): Promise<string> {
  if (chain === "ltc") {
    const res = await fetch(`${LTC_BOOK}/sendtx/`, {
      method: "POST",
      headers: { ...bookHeaders(), "content-type": "text/plain" },
      body: hex,
    });
    const json = (await res.json().catch(() => null)) as
      | { result?: string; error?: string }
      | null;
    if (!res.ok || !json?.result) {
      throw new Error(`Litecoin broadcast rejected: ${json?.error ?? `HTTP ${res.status}`}`);
    }
    return json.result;
  }
  return broadcastRawTx(chain, hex);
}

export async function confirmationsFor(chain: UtxoChainId, txid: string): Promise<number | null> {
  if (chain === "ltc") {
    const tx = await book<{ confirmations?: number }>(`/tx/${encodeURIComponent(txid)}`);
    return tx ? (tx.confirmations ?? 0) : null;
  }
  return fetchTxConfirmations(chain, txid);
}

export async function feeRateFor(chain: UtxoChainId): Promise<number> {
  if (chain === "ltc") {
    const est = await book<{ result?: string }>("/estimatefee/2");
    const perKb = Number(est?.result ?? 0);
    const satPerVb = Math.round((perKb * 1e8) / 1000);
    return satPerVb > 0 ? satPerVb : DEFAULT_FEE_RATE.ltc;
  }
  if (chain === "txc") {
    try {
      const { fetchChainSnapshot } = await import("@/lib/txc.server");
      const snap = await fetchChainSnapshot();
      return snap.halfHourFee && snap.halfHourFee > 0 ? snap.halfHourFee : DEFAULT_FEE_RATE.txc;
    } catch {
      return DEFAULT_FEE_RATE.txc;
    }
  }
  return DEFAULT_FEE_RATE[chain];
}
