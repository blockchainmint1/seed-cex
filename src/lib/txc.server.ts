/**
 * TEXITcoin chain reads. Public, key-less, mempool.space-compatible REST API.
 * Kept server-side so every browser tab doesn't hammer the public endpoint.
 */
const BASE = "https://mempool.texitcoin.org";

async function get<T>(path: string, timeoutMs = 6000): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      console.error(`[txc] ${path} failed [${res.status}]: ${await res.text()}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[txc] ${path} threw`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type ChainSnapshot = {
  height: number | null;
  lastBlockAt: string | null;
  fastestFee: number | null;
  halfHourFee: number | null;
  mempoolCount: number | null;
  online: boolean;
};

export async function fetchChainSnapshot(): Promise<ChainSnapshot> {
  // Our own node is authoritative; the public Esplora mirror is the fallback.
  const { fetchNodeStatus, rpcConfigured } = await import("./rpc.server");
  if (rpcConfigured("txc")) {
    const node = await fetchNodeStatus("txc");
    if (node.online) {
      // estimatesmartfee returns coins/kvB; convert to sat/vB.
      const satPerVb = node.feeRate ? Math.max(1, Math.round((node.feeRate * 1e8) / 1000)) : null;
      return {
        height: node.blocks,
        lastBlockAt: node.medianTimeIso,
        fastestFee: satPerVb,
        halfHourFee: satPerVb,
        mempoolCount: node.mempoolCount,
        online: true,
      };
    }
  }

  const [blocks, fees, mempool] = await Promise.all([
    get<Array<{ height: number; timestamp: number }>>("/api/blocks"),
    get<{ fastestFee: number; halfHourFee: number }>("/api/v1/fees/recommended"),
    get<{ count: number }>("/api/mempool"),
  ]);

  const tip = blocks?.[0];
  return {
    height: tip?.height ?? null,
    lastBlockAt: tip?.timestamp ? new Date(tip.timestamp * 1000).toISOString() : null,
    fastestFee: fees?.fastestFee ?? null,
    halfHourFee: fees?.halfHourFee ?? null,
    mempoolCount: mempool?.count ?? null,
    online: Boolean(blocks?.length),
  };
}

export type AddressStats = {
  address: string;
  confirmed: number;
  unconfirmed: number;
  txCount: number;
  online: boolean;
};

type EsploraAddress = {
  chain_stats?: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
  mempool_stats?: { funded_txo_sum: number; spent_txo_sum: number };
};

/** Balances come back in satoshi-equivalents; we return whole TXC. */
export async function fetchAddressStats(address: string): Promise<AddressStats> {
  const data = await get<EsploraAddress>(`/api/address/${encodeURIComponent(address)}`);
  if (!data?.chain_stats) {
    return { address, confirmed: 0, unconfirmed: 0, txCount: 0, online: false };
  }
  const c = data.chain_stats;
  const m = data.mempool_stats;
  return {
    address,
    confirmed: (c.funded_txo_sum - c.spent_txo_sum) / 1e8,
    unconfirmed: m ? (m.funded_txo_sum - m.spent_txo_sum) / 1e8 : 0,
    txCount: c.tx_count,
    online: true,
  };
}
