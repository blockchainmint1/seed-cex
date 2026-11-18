/**
 * Coin search and market facts from DexScreener's free public API (no key).
 * Used only to FIND coins and show their price/liquidity; the actual swap price
 * always comes from the pool contracts themselves (quote.server.ts).
 */
import { DEX_NETWORKS, DEX_NETWORK_IDS, NATIVE, isAddress, isNative, type DexNetwork } from "./venues";

type DsPair = {
  chainId: string;
  dexId: string;
  labels?: string[];
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  priceNative?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  pairCreatedAt?: number;
  info?: { imageUrl?: string };
};

export type DexToken = {
  network: DexNetwork;
  address: string;
  symbol: string;
  name: string;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  ageDays: number | null;
  imageUrl: string | null;
  venues: string[];
};

const ALLOWED: Record<DexNetwork, Record<string, string[]>> = {
  ethereum: { uniswap: ["v2", "v3"] },
  base: { uniswap: ["v2", "v3"] },
  bsc: { pancakeswap: ["v2", "v3"] },
  pulsechain: { pulsex: ["v1", "v2"] },
};

/** Only pools Seeds can actually trade through (Uniswap v4 etc. are skipped). */
function usable(p: DsPair): p is DsPair & { chainId: DexNetwork } {
  if (!(DEX_NETWORK_IDS as readonly string[]).includes(p.chainId)) return false;
  const labels = ALLOWED[p.chainId as DexNetwork][p.dexId];
  if (!labels) return false;
  const l = p.labels?.[0] ?? (p.chainId === "pulsechain" ? "v1" : "v2");
  return labels.includes(l);
}

async function ds<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const cache = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v as T;
  const v = await fn();
  cache.set(key, { at: Date.now(), v });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return v;
}

/** Fold pairs into one row per (network, token): deepest-pool price, total liquidity. */
function fold(pairs: DsPair[], only?: { network: DexNetwork; address: string }): DexToken[] {
  const map = new Map<string, DexToken & { _best: number }>();
  const wrappedOf = (n: DexNetwork) => DEX_NETWORKS[n].wrapped.toLowerCase();
  for (const p of pairs) {
    if (!usable(p)) continue;
    const net = p.chainId;
    for (const side of [p.baseToken, p.quoteToken]) {
      if (only && (only.network !== net || side.address.toLowerCase() !== only.address.toLowerCase())) continue;
      // Without `only`, list the coin being searched for (the pair's base), not the WETH it trades against.
      if (!only && side === p.quoteToken) continue;
      const key = `${net}:${side.address.toLowerCase()}`;
      const liq = p.liquidity?.usd ?? 0;
      const isBase = side === p.baseToken;
      // DexScreener prices the base; the quote side's price is base price ÷ (base in quote units).
      const priceUsd = !p.priceUsd ? null : isBase ? Number(p.priceUsd) : p.priceNative && Number(p.priceNative) > 0 ? Number(p.priceUsd) / Number(p.priceNative) : null;
      const row = map.get(key) ?? {
        network: net, address: side.address, symbol: side.symbol, name: side.name, priceUsd: null,
        liquidityUsd: 0, volume24hUsd: 0, ageDays: null, imageUrl: null, venues: [], _best: -1,
      };
      row.liquidityUsd = (row.liquidityUsd ?? 0) + liq;
      row.volume24hUsd = (row.volume24hUsd ?? 0) + (p.volume?.h24 ?? 0);
      if (priceUsd !== null && liq > row._best) { row.priceUsd = priceUsd; row._best = liq; }
      if (isBase && p.info?.imageUrl && !row.imageUrl) row.imageUrl = p.info.imageUrl;
      if (p.pairCreatedAt) {
        const age = (Date.now() - p.pairCreatedAt) / 86_400_000;
        row.ageDays = row.ageDays === null ? age : Math.max(row.ageDays, age);
      }
      const v = `${p.dexId} ${p.labels?.[0] ?? ""}`.trim();
      if (!row.venues.includes(v)) row.venues.push(v);
      if (side.address.toLowerCase() === wrappedOf(net)) row.symbol = side.symbol;
      map.set(key, row);
    }
  }
  return [...map.values()].map(({ _best, ...r }) => r);
}

/** Search by name, symbol or pasted contract address across the four networks. */
export async function searchDexTokens(q: string, network?: DexNetwork): Promise<DexToken[]> {
  const query = q.trim().slice(0, 80);
  if (!query) return [];
  return cached(`s:${network ?? "*"}:${query.toLowerCase()}`, 60_000, async () => {
    let rows: DexToken[];
    if (isAddress(query)) {
      const nets = network ? [network] : [...DEX_NETWORK_IDS];
      const all = await Promise.all(nets.map(async (n) => {
        const pairs = (await ds<DsPair[]>(`/token-pairs/v1/${n}/${query}`)) ?? [];
        return fold(pairs, { network: n, address: query });
      }));
      rows = all.flat();
    } else {
      // The search answers 30 pairs across every chain; adding the network name pulls in that network's pools.
      const queries = network ? [query, `${query} ${network}`] : [query];
      const answers = await Promise.all(queries.map((x) => ds<{ pairs?: DsPair[] }>(`/latest/dex/search?q=${encodeURIComponent(x)}`)));
      const seen = new Set<string>();
      const pairs = answers.flatMap((r) => r?.pairs ?? []).filter((p) => !seen.has(p.pairAddress) && (seen.add(p.pairAddress), true));
      rows = fold(pairs);
      if (network) rows = rows.filter((t) => t.network === network);
    }
    return rows.sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0)).slice(0, 25);
  });
}

/** Market facts for one coin (native coins use their wrapped version's pools). */
export async function tokenMarket(network: DexNetwork, address: string): Promise<DexToken | null> {
  const a = isNative(address) ? DEX_NETWORKS[network].wrapped : address;
  return cached(`m:${network}:${a.toLowerCase()}`, 60_000, async () => {
    const pairs = (await ds<DsPair[]>(`/token-pairs/v1/${network}/${a}`)) ?? [];
    const row = fold(pairs, { network, address: a })[0] ?? null;
    if (row && isNative(address)) return { ...row, address: NATIVE, symbol: DEX_NETWORKS[network].nativeSymbol, name: DEX_NETWORKS[network].nativeSymbol };
    return row;
  });
}
