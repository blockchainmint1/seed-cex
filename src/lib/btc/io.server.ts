/**
 * Bitcoin mainnet I/O.
 *
 * Seeds runs no Bitcoin node, so reads and broadcasts go through NowNodes'
 * Blockbook indexer — the same path the wrap issuer uses. Alchemy's Bitcoin node
 * (no address index) backs up fee estimates and broadcasts when Blockbook can't be
 * reached. Server-only: API keys are read inside each call, never at module scope.
 */
import type { BtcUtxo } from "./tx.server";
import { bitcoinRpc } from "@/lib/nodes.server";

/** One Bitcoin Core call through Alchemy; null when unavailable or it didn't answer. */
async function alchemyBtc<T>(method: string, params: unknown[]): Promise<{ result: T | null; error: string | null } | null> {
  const ep = bitcoinRpc();
  if (!ep) return null;
  try {
    const res = await fetch(ep.url, { method: "POST", headers: ep.headers, signal: AbortSignal.timeout(15_000), body: JSON.stringify({ jsonrpc: "1.0", id: 1, method, params }) });
    const j = (await res.json().catch(() => null)) as { result?: T; error?: { message?: string } | null } | null;
    if (!j) return null;
    return { result: j.result ?? null, error: j.error ? (j.error.message ?? "rejected") : null };
  } catch {
    return null;
  }
}

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

export type BtcBalance = { online: boolean; confirmed: number; unconfirmed: number; waitingTxs?: number };

/** Confirmed + mempool balance at an address, in whole BTC. */
export async function fetchBtcBalance(address: string): Promise<BtcBalance> {
  if (!btcOnline()) return { online: false, confirmed: 0, unconfirmed: 0 };
  const res = await book<{ balance?: string; unconfirmedBalance?: string; unconfirmedTxs?: number }>(
    `/address/${encodeURIComponent(address)}?details=basic`,
  );
  if (!res) return { online: false, confirmed: 0, unconfirmed: 0 };
  return {
    online: true,
    confirmed: Number(res.balance ?? 0) / 1e8,
    unconfirmed: Number(res.unconfirmedBalance ?? 0) / 1e8,
    waitingTxs: Number(res.unconfirmedTxs ?? 0) || 0,
  };
}

/** BTC on its way to an address, not in a block yet (display only; account/arriving.ts). */
export async function fetchBtcArriving(address: string): Promise<number> {
  if (!btcOnline()) return 0;
  const { blockbookArriving } = await import("@/lib/account/arriving.server");
  return blockbookArriving(BOOK, headers(), address);
}

/** Spendable outputs at an address: confirmed coins plus its own change still waiting for a block (book-self-change.ts). */
export async function fetchBtcUtxos(address: string): Promise<BtcUtxo[]> {
  const { bookSpendableRows } = await import("@/lib/utxo/book-self-change.server");
  const rows = await bookSpendableRows(BOOK, headers(), address);
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
  let btcPerKb = Number(res?.result ?? 0);
  if (!Number.isFinite(btcPerKb) || btcPerKb <= 0) {
    const alt = await alchemyBtc<{ feerate?: number }>("estimatesmartfee", [3]);
    btcPerKb = Number(alt?.result?.feerate ?? 0);
  }
  if (!Number.isFinite(btcPerKb) || btcPerKb <= 0) return FALLBACK_FEE_RATE;
  const satPerVb = Math.round((btcPerKb * 1e8) / 1000);
  return Math.min(200, Math.max(2, satPerVb));
}

/** Push a signed transaction. Returns the network's txid. */
export async function broadcastBtcTx(hex: string): Promise<string> {
  let res: Response | null = null;
  try {
    res = await fetch(`${BOOK}/sendtx/`, {
      method: "POST",
      headers: { ...headers(), "content-type": "text/plain" },
      body: hex,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    res = null;
  }
  // Blockbook didn't answer: hand the same signed transaction to Alchemy's node instead.
  if (!res || res.status === 429 || res.status >= 500 || res.status === 401 || res.status === 403) {
    const alt = await alchemyBtc<string>("sendrawtransaction", [hex]);
    if (alt?.result) return alt.result;
    if (alt?.error) throw new Error(`Bitcoin broadcast rejected: ${alt.error}`);
    throw new Error(`Bitcoin broadcast failed (${res ? res.status : "no answer"})`);
  }
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
