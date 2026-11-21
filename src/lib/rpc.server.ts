/**
 * Direct Bitcoin-Core-style JSON-RPC clients for the TEXITcoin (TXC) and
 * ISK nodes. Server-only: credentials never leave the worker.
 *
 * These nodes are authoritative — the public Esplora mirror
 * (mempool.texitcoin.org) is only a fallback for address/UTXO indexing.
 */

export type RpcChain = "txc" | "isk";

type RpcCreds = { url: string; user: string; pass: string };

function creds(chain: RpcChain): RpcCreds | null {
  const url =
    chain === "txc" ? process.env.TXC_RPC_ADDRESS : process.env.ISK_RPC_URL;
  const user = chain === "txc" ? process.env.TXC_RPC_USER : process.env.ISK_RPC_USER;
  const pass =
    chain === "txc" ? process.env.TXC_RPC_PASSWORD : process.env.ISK_RPC_PASS;
  if (!url || !user || !pass) return null;
  return { url, user, pass };
}

export function rpcConfigured(chain: RpcChain): boolean {
  return creds(chain) !== null;
}

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

/** Single JSON-RPC call. Throws RpcError on node-level failure. */
export async function rpc<T = unknown>(
  chain: RpcChain,
  method: string,
  params: unknown[] = [],
  timeoutMs = 12_000,
  /** e.g. "/wallet/<name>" for wallet-scoped calls such as omni_decodetransaction */
  path = "",
): Promise<T> {
  const c = creds(chain);
  if (!c) throw new RpcError(`${chain.toUpperCase()} RPC is not configured`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path ? c.url.replace(/\/+$/, "") + path : c.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${btoa(`${c.user}:${c.pass}`)}`,
      },
      body: JSON.stringify({ jsonrpc: "1.0", id: "seeds", method, params }),
    });
    const text = await res.text();
    let body: { result?: T; error?: { code: number; message: string } };
    try {
      body = JSON.parse(text);
    } catch {
      throw new RpcError(`${method}: non-JSON response [${res.status}]`);
    }
    if (body.error) throw new RpcError(`${method}: ${body.error.message}`, body.error.code);
    if (!res.ok) throw new RpcError(`${method}: HTTP ${res.status}`);
    return body.result as T;
  } catch (err) {
    if (err instanceof RpcError) throw err;
    throw new RpcError(`${method}: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Several calls in one JSON-RPC batch (one round trip). Each answer is the call's
 * result, or an RpcError for that call; the whole batch throws when the node can't
 * be reached or replies with something other than a matching list.
 */
export async function rpcBatch<T = unknown>(
  chain: RpcChain,
  calls: Array<{ method: string; params: unknown[] }>,
  timeoutMs = 8_000,
): Promise<Array<T | RpcError>> {
  if (!calls.length) return [];
  const c = creds(chain);
  if (!c) throw new RpcError(`${chain.toUpperCase()} RPC is not configured`);
  const res = await fetch(c.url, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "content-type": "application/json", authorization: `Basic ${btoa(`${c.user}:${c.pass}`)}` },
    body: JSON.stringify(calls.map((k, i) => ({ jsonrpc: "1.0", id: i, method: k.method, params: k.params }))),
  }).catch((e: Error) => { throw new RpcError(`batch: ${e.message}`); });
  const body = (await res.json().catch(() => null)) as Array<{ id?: unknown; result?: T; error?: { code: number; message: string } | null }> | null;
  if (!Array.isArray(body) || body.length !== calls.length) throw new RpcError(`batch: unexpected reply [${res.status}]`);
  const out: Array<T | RpcError> = new Array(calls.length);
  for (const r of body) {
    if (!Number.isInteger(r?.id) || (r.id as number) < 0 || (r.id as number) >= calls.length || out[r.id as number] !== undefined) {
      throw new RpcError("batch: reply ids don't match the calls");
    }
    out[r.id as number] = r.error ? new RpcError(`${calls[r.id as number]!.method}: ${r.error.message}`, r.error.code) : (r.result as T);
  }
  return out;
}

/** Never throws — returns null when the node is unreachable. */
export async function tryRpc<T = unknown>(
  chain: RpcChain,
  method: string,
  params: unknown[] = [],
): Promise<T | null> {
  try {
    return await rpc<T>(chain, method, params);
  } catch (err) {
    console.error(`[rpc:${chain}]`, (err as Error).message);
    return null;
  }
}

export type NodeStatus = {
  chain: RpcChain;
  label: string;
  configured: boolean;
  online: boolean;
  network: string | null;
  blocks: number | null;
  headers: number | null;
  bestBlockHash: string | null;
  difficulty: number | null;
  medianTimeIso: string | null;
  synced: boolean;
  version: string | null;
  connections: number | null;
  mempoolCount: number | null;
  mempoolBytes: number | null;
  /** Estimated fee in whole coins per kvB for a 6-block target. */
  feeRate: number | null;
};

const LABELS: Record<RpcChain, string> = { txc: "TEXITcoin", isk: "ISK" };

export async function fetchNodeStatus(chain: RpcChain): Promise<NodeStatus> {
  const base: NodeStatus = {
    chain,
    label: LABELS[chain],
    configured: rpcConfigured(chain),
    online: false,
    network: null,
    blocks: null,
    headers: null,
    bestBlockHash: null,
    difficulty: null,
    medianTimeIso: null,
    synced: false,
    version: null,
    connections: null,
    mempoolCount: null,
    mempoolBytes: null,
    feeRate: null,
  };
  if (!base.configured) return base;

  const [info, net, pool, fee] = await Promise.all([
    tryRpc<{
      chain: string;
      blocks: number;
      headers: number;
      bestblockhash: string;
      difficulty: number;
      mediantime: number;
      initialblockdownload: boolean;
    }>(chain, "getblockchaininfo"),
    tryRpc<{ subversion: string; connections: number }>(chain, "getnetworkinfo"),
    tryRpc<{ size: number; bytes: number }>(chain, "getmempoolinfo"),
    tryRpc<{ feerate?: number }>(chain, "estimatesmartfee", [6]),
  ]);

  if (!info) return base;
  return {
    ...base,
    online: true,
    network: info.chain,
    blocks: info.blocks,
    headers: info.headers,
    bestBlockHash: info.bestblockhash,
    difficulty: info.difficulty,
    medianTimeIso: info.mediantime ? new Date(info.mediantime * 1000).toISOString() : null,
    synced: !info.initialblockdownload && info.blocks === info.headers,
    version: net?.subversion ?? null,
    connections: net?.connections ?? null,
    mempoolCount: pool?.size ?? null,
    mempoolBytes: pool?.bytes ?? null,
    feeRate: fee?.feerate ?? null,
  };
}

export async function fetchAllNodeStatus(): Promise<NodeStatus[]> {
  return Promise.all([fetchNodeStatus("txc"), fetchNodeStatus("isk")]);
}

/** Broadcast a signed raw transaction. Returns the txid. */
export async function broadcastRawTx(chain: RpcChain, rawHex: string): Promise<string> {
  return rpc<string>(chain, "sendrawtransaction", [rawHex]);
}

/** Confirmation count for a broadcast txid, or null if unknown to the node. */
export async function fetchTxConfirmations(
  chain: RpcChain,
  txid: string,
): Promise<number | null> {
  const tx = await tryRpc<{ confirmations?: number }>(chain, "getrawtransaction", [txid, true]);
  if (!tx) return null;
  return tx.confirmations ?? 0;
}

/**
 * UTXO set scan for a set of addresses. Uses scantxoutset, which needs no
 * address index but is slow — callers should cache.
 */
export type ScannedUtxo = {
  txid: string;
  vout: number;
  scriptPubKey: string;
  amount: number;
  height: number;
};

// The node runs one scantxoutset at a time and refuses a second ("Scan already in progress"),
// which would read as an unreadable pocket. A refused scan waits briefly and tries again.
// Scans are never shared between requests (Cloudflare Workers drops a promise awaited by
// a request other than the one that created it) and no answer is reused after it
// finishes, so coin selection before a send always sees the current UTXO set.
const SCAN_BUSY_RETRIES = 4;
const SCAN_BUSY_WAIT_MS = 1_500;

export async function scanAddressUtxos(
  chain: RpcChain,
  addresses: string[],
): Promise<{ utxos: ScannedUtxo[]; total: number } | null> {
  if (addresses.length === 0) return { utxos: [], total: 0 };
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await rpc<{ success: boolean; total_amount: number; unspents: ScannedUtxo[] }>(
        chain,
        "scantxoutset",
        ["start", addresses.map((a) => `addr(${a})`)],
      );
      if (!res?.success) return null;
      return { utxos: res.unspents ?? [], total: res.total_amount ?? 0 };
    } catch (err) {
      const busy = /in progress/i.test((err as Error).message);
      if (!busy || attempt >= SCAN_BUSY_RETRIES) {
        console.error(`[rpc:${chain}]`, (err as Error).message);
        return null;
      }
      await new Promise((r) => setTimeout(r, SCAN_BUSY_WAIT_MS));
    }
  }
}
