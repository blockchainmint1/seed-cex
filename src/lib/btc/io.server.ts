/**
 * Bitcoin mainnet I/O.
 *
 * Seeds runs no Bitcoin node, so reads and broadcasts go through NowNodes'
 * Blockbook indexer — the same path the wrap issuer uses. Server-only: the
 * API key is read inside each call, never at module scope.
 */
import type { BtcUtxo } from "./tx.server";

const BOOK = "https://btcbook.nownodes.io/api/v2";
const FALLBACK_FEE_RATE = 8;

function headers(): HeadersInit {
  return {
    "api-key": process.env["NOWNODES_API_KEY"] ?? "",
    // Blockbook sits behind a WAF that rejects requests without a UA.
    "User-Agent": "seeds-exchange/1.0",
    accept: "application/json",
  };
}

export function btcOnline(): boolean {
  return Boolean(process.env["NOWNODES_API_KEY"]);
}

async function book<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BOOK}${path}`, { headers: headers() });
    if (!res.ok) {
      console.error(`[btc] blockbook ${path} failed [${res.status}]`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[btc] blockbook ${path} threw`, err);
    return null;
  }
}

export type BtcBalance = { online: boolean; confirmed: number; unconfirmed: number };

/** Confirmed + mempool balance at an address, in whole BTC. */
export async function fetchBtcBalance(address: string): Promise<BtcBalance> {
  if (!btcOnline()) return { online: false, confirmed: 0, unconfirmed: 0 };
  const res = await book<{ balance?: string; unconfirmedBalance?: string }>(
    `/address/${encodeURIComponent(address)}?details=basic`,
  );
  if (!res) return { online: false, confirmed: 0, unconfirmed: 0 };
  return {
    online: true,
    confirmed: Number(res.balance ?? 0) / 1e8,
    unconfirmed: Number(res.unconfirmedBalance ?? 0) / 1e8,
  };
}

/** Confirmed spendable outputs at an address. */
export async function fetchBtcUtxos(address: string): Promise<BtcUtxo[]> {
  const rows = await book<Array<{ txid: string; vout: number; value: string; height?: number }>>(
    `/utxo/${encodeURIComponent(address)}?confirmed=true`,
  );
  if (!rows) throw new Error("Could not read Bitcoin UTXOs (indexer unreachable)");
  return rows.map((r) => ({
    txid: r.txid,
    vout: r.vout,
    amount: Number(r.value) / 1e8,
    height: r.height ?? 0,
  }));
}

/** Recommended sat/vB for confirmation within a few blocks. */
export async function fetchBtcFeeRate(): Promise<number> {
  const res = await book<{ result?: string }>("/estimatefee/3");
  const btcPerKb = Number(res?.result ?? 0);
  if (!Number.isFinite(btcPerKb) || btcPerKb <= 0) return FALLBACK_FEE_RATE;
  const satPerVb = Math.round((btcPerKb * 1e8) / 1000);
  return Math.min(200, Math.max(2, satPerVb));
}

/** Push a signed transaction. Returns the network's txid. */
export async function broadcastBtcTx(hex: string): Promise<string> {
  const res = await fetch(`${BOOK}/sendtx/`, {
    method: "POST",
    headers: { ...headers(), "content-type": "text/plain" },
    body: hex,
  });
  const text = await res.text();
  let parsed: { result?: string; error?: string } | null = null;
  try {
    parsed = text ? (JSON.parse(text) as { result?: string; error?: string }) : null;
  } catch {
    parsed = null;
  }
  if (!res.ok || parsed?.error || !parsed?.result) {
    throw new Error(parsed?.error ?? `Bitcoin broadcast failed (${res.status})`);
  }
  return parsed.result;
}
