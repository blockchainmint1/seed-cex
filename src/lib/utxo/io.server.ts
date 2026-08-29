/**
 * UTXO chain I/O for the settlement engine.
 *
 * TXC and ISK go through our own Bitcoin-Core-style nodes (`rpc.server`).
 * Litecoin has no private node, so it goes through NowNodes' Blockbook
 * indexer. Server-only: every credential is read from the environment inside
 * the call, never at module scope.
 */
import { bytesToHex } from "@noble/hashes/utils.js";
import { getChain, type UtxoChainId } from "@/lib/chains";
import { broadcastRawTx, fetchTxConfirmations, rpcConfigured, scanAddressUtxos } from "@/lib/rpc.server";
import { addressToScriptFor, type Utxo } from "@/lib/txc/tx.server";

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

  if (chain === "txc") {
    // Public Esplora mirror is the TXC fallback when our node is down.
    const script = bytesToHex(addressToScriptFor(address, p2pkhVersionOf("txc")));
    const res = await fetch(
      `https://mempool.texitcoin.org/api/address/${encodeURIComponent(address)}/utxo`,
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) throw new Error(`Could not read UTXOs for ${address}`);
    const rows = (await res.json()) as Array<{
      txid: string;
      vout: number;
      value: number;
      status?: { block_height?: number };
    }>;
    return rows.map((r) => ({
      txid: r.txid,
      vout: r.vout,
      scriptPubKey: script,
      amount: r.value / 1e8,
      height: r.status?.block_height ?? 0,
    }));
  }

  throw new Error(`The ${getChain(chain).name} node is unreachable`);
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
