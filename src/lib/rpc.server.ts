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
): Promise<T> {
  const c = creds(chain);
  if (!c) throw new RpcError(`${chain.toUpperCase()} RPC is not configured`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(c.url, {
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

export async function scanAddressUtxos(
  chain: RpcChain,
  addresses: string[],
): Promise<{ utxos: ScannedUtxo[]; total: number } | null> {
  if (addresses.length === 0) return { utxos: [], total: 0 };
  const res = await tryRpc<{
    success: boolean;
    total_amount: number;
    unspents: ScannedUtxo[];
  }>(chain, "scantxoutset", ["start", addresses.map((a) => `addr(${a})`)]);
  if (!res?.success) return null;
  return { utxos: res.unspents ?? [], total: res.total_amount ?? 0 };
}
