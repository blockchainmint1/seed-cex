/**
 * Send-time network I/O for the newer pocket coins (DOGE, BCH, XRP, TRON, SOL).
 * Reads (UTXOs, sequence, block refs, blockhash, fees) and broadcast only — the
 * transactions themselves are built and signed locally in src/lib/pockets/*.
 * Every function throws a plain-English error; nothing here touches keys.
 * XRP, TRON and Solana ask paid providers first (nodes.server.ts). Reads move on to
 * the next server on any failure; broadcasts move on only when a server didn't answer,
 * so a real refusal is never retried somewhere else as if it hadn't happened.
 */
import type { SpendableUtxo } from "@/lib/pockets/utxo-sign.server";
import { nodeEndpoints, shouldFailOver, type NodeEndpoint } from "@/lib/nodes.server";

const UA = { "User-Agent": "seeds-exchange/1.0", accept: "application/json" };
const BOOK: Record<"DOGE" | "BCH", string> = {
  DOGE: "https://dogebook.nownodes.io/api/v2",
  BCH: "https://bchbook.nownodes.io/api/v2",
};

/** A server that didn't answer (as opposed to one that answered "no"). */
class Unreachable extends Error {}

function bookHeaders(): Record<string, string> {
  return { ...UA, "api-key": process.env.NOWNODES_API_KEY ?? "" };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Unreachable(`${new URL(url).host} didn't answer`);
  }
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* keep null */ }
  if (shouldFailOver(res.status)) throw new Unreachable(`${new URL(url).host} answered ${res.status}`);
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}${json && typeof json === "object" && "error" in json ? `: ${String((json as { error: unknown }).error)}` : ""}`);
  return json as T;
}

/**
 * Try servers in order. `final` decides whether an answered error stops here:
 * reads pass false (any failure moves on), broadcasts pass true.
 */
async function tryEach<T>(eps: NodeEndpoint[], label: string, final: boolean, call: (e: NodeEndpoint) => Promise<T>): Promise<T> {
  let last: unknown = null;
  for (const e of eps) {
    try { return await call(e); } catch (err) {
      last = err;
      if (final && !(err instanceof Unreachable)) throw err;
    }
  }
  throw new Error(`${label} unreachable: ${last instanceof Error ? last.message : "no server answered"}`);
}

// ---------- Dogecoin / Bitcoin Cash (Blockbook) ----------

export async function bookUtxos(coin: "DOGE" | "BCH", address: string): Promise<SpendableUtxo[]> {
  const rows = await fetchJson<Array<{ txid: string; vout: number; value: string }>>(
    `${BOOK[coin]}/utxo/${encodeURIComponent(address)}?confirmed=true`, { headers: bookHeaders() });
  return rows.map((r) => ({ txid: r.txid, vout: r.vout, value: BigInt(r.value) }));
}

/** sat/byte. DOGE relays need ≥ 0.01 DOGE/kB (1,000 sat/B); BCH ≥ 1 sat/B. */
export async function bookFeeRate(coin: "DOGE" | "BCH"): Promise<number> {
  const floor = coin === "DOGE" ? 1000 : 1;
  try {
    const est = await fetchJson<{ result?: string }>(`${BOOK[coin]}/estimatefee/3`, { headers: bookHeaders() });
    const perByte = Math.ceil((Number(est?.result ?? 0) * 1e8) / 1000);
    return Math.min(coin === "DOGE" ? 5000 : 20, Math.max(floor, perByte || floor));
  } catch {
    return coin === "DOGE" ? 1000 : 2;
  }
}

export async function bookBroadcast(coin: "DOGE" | "BCH", hex: string): Promise<string> {
  const res = await fetch(`${BOOK[coin]}/sendtx/`, {
    method: "POST", headers: { ...bookHeaders(), "content-type": "text/plain" }, body: hex, signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => null)) as { result?: string; error?: string } | null;
  if (!res.ok || !json?.result) throw new Error(`${coin} broadcast rejected: ${json?.error ?? `HTTP ${res.status}`}`);
  return json.result;
}

// ---------- XRP Ledger ----------

async function xrp<T>(method: string, params: Record<string, unknown>, final = false): Promise<T> {
  return tryEach(nodeEndpoints("xrp"), "XRP Ledger", final, async (e) => {
    const j = await fetchJson<{ result: T & { status?: string; error_message?: string; error?: string } }>(e.url, {
      method: "POST", headers: { ...UA, ...e.headers, "content-type": "application/json" }, body: JSON.stringify({ method, params: [params] }),
    });
    if (j.result?.status === "error") throw new Error(j.result.error_message ?? j.result.error ?? "XRPL error");
    return j.result;
  });
}

export async function xrpAccount(address: string): Promise<{ sequence: number; balanceDrops: bigint; ownerCount: number; currentLedger: number }> {
  const r = await xrp<{ account_data: { Sequence: number; Balance: string; OwnerCount?: number }; ledger_current_index: number }>(
    "account_info", { account: address, ledger_index: "current" });
  return { sequence: r.account_data.Sequence, balanceDrops: BigInt(r.account_data.Balance), ownerCount: r.account_data.OwnerCount ?? 0, currentLedger: r.ledger_current_index };
}

/** Open-ledger fee with headroom, capped at 0.001 XRP. */
export async function xrpFeeDrops(): Promise<bigint> {
  try {
    const r = await xrp<{ drops: { open_ledger_fee: string } }>("fee", {});
    const f = BigInt(r.drops.open_ledger_fee);
    return f < 12n ? 12n : f > 1000n ? 1000n : (f * 12n) / 10n;
  } catch { return 15n; }
}

/** Base + owner reserve, in drops (1 XRP + 0.2 XRP per owned object since Dec 2024). */
export async function xrpReserveDrops(ownerCount: number): Promise<bigint> {
  try {
    const r = await xrp<{ info: { validated_ledger?: { reserve_base_xrp?: number; reserve_inc_xrp?: number } } }>("server_info", {});
    const base = r.info.validated_ledger?.reserve_base_xrp ?? 1;
    const inc = r.info.validated_ledger?.reserve_inc_xrp ?? 0.2;
    return BigInt(Math.ceil((base + inc * ownerCount) * 1e6));
  } catch { return BigInt(Math.ceil((1 + 0.2 * ownerCount) * 1e6)) + 1_000_000n; }
}

export async function xrpSubmit(hex: string): Promise<void> {
  const r = await xrp<{ engine_result: string; engine_result_message?: string }>("submit", { tx_blob: hex }, true);
  if (!/^(tesSUCCESS|terQUEUED)$/.test(r.engine_result)) {
    throw new Error(`XRP Ledger refused the payment: ${r.engine_result}${r.engine_result_message ? ` — ${r.engine_result_message}` : ""}`);
  }
}

// ---------- TRON ----------

const tronPost = <T>(path: string, body: unknown, final = false) =>
  tryEach(nodeEndpoints("tron"), "TRON", final, async (e) => {
    const r = await fetchJson<T & { Error?: string }>(`${e.url}${path}`, {
      method: "POST", headers: { ...UA, ...e.headers, "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (!final && r && typeof r === "object" && "Error" in r && r.Error) throw new Error(String(r.Error));
    return r;
  });

export async function tronRefBlock(): Promise<{ number: number; id: string; timestamp: number }> {
  const b = await tronPost<{ blockID: string; block_header: { raw_data: { number: number; timestamp: number } } }>("/wallet/getnowblock", {});
  return { number: b.block_header.raw_data.number, id: b.blockID, timestamp: b.block_header.raw_data.timestamp };
}

export async function tronBroadcast(hex: string): Promise<void> {
  const r = await tronPost<{ result?: boolean; code?: string; message?: string }>("/wallet/broadcasthex", { transaction: hex }, true);
  // An earlier server took it before timing out: the same signed transfer is already on its way.
  if (!r.result && r.code === "DUP_TRANSACTION_ERROR") return;
  if (!r.result) {
    let msg = r.message ?? (r as { Error?: string }).Error ?? "";
    if (/^[0-9a-f]+$/i.test(msg)) msg = Buffer.from(msg, "hex").toString("utf8");
    throw new Error(`TRON refused the transfer: ${r.code ?? ""} ${msg}`.trim());
  }
}

// ---------- Solana ----------

async function sol<T>(method: string, params: unknown[], final = false): Promise<T> {
  return tryEach(nodeEndpoints("solana"), "Solana", final, async (e) => {
    const j = await fetchJson<{ result?: T; error?: { message: string } }>(e.url, {
      method: "POST", headers: { ...UA, ...e.headers, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (j.error) {
      // Alchemy answers "not enabled for this app" if Solana is ever switched off there: treat as no answer and move on.
      if (/not enabled/i.test(j.error.message)) throw new Unreachable(j.error.message);
      throw new Error(j.error.message);
    }
    return j.result as T;
  });
}

export async function solBlockhash(): Promise<string> {
  const r = await sol<{ value: { blockhash: string } }>("getLatestBlockhash", [{ commitment: "finalized" }]);
  return r.value.blockhash;
}

export async function solLamports(address: string): Promise<bigint> {
  const r = await sol<{ value: number }>("getBalance", [address, { commitment: "confirmed" }]);
  return BigInt(r.value);
}

export async function solSend(base64: string): Promise<string> {
  return sol<string>("sendTransaction", [base64, { encoding: "base64", preflightCommitment: "confirmed", maxRetries: 5 }], true);
}

export async function tronSun(address: string): Promise<bigint> {
  const r = await tronPost<{ balance?: number }>("/wallet/getaccount", { address, visible: true });
  return BigInt(r.balance ?? 0);
}
