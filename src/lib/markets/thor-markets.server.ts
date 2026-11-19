/**
 * THORChain market data (prices, candles, volume) from Midgard, THORChain's
 * public history service. Read-only: nothing here can move coins.
 *
 * Finished answers are cached briefly per server instance so visitors don't
 * multiply calls to the public servers.
 */
import {
  dayStats, INTERVAL_SECONDS, mergeCandles, withLivePrice, parseCandles, THOR_MARKETS, TIMEFRAMES,
  type Candle, type DayStats, type ThorMarket, type Timeframe,
} from "./thor-markets";

/**
 * Public Midgard servers, tried in order. Liquify is the only one reliably
 * answering (Nine Realms' Midgard no longer resolves, Nov 2026; THORSwap's
 * often answers with a bot check), so it's tried twice: slow answers are common.
 */
const MIDGARD = [
  "https://gateway.liquify.com/chain/thorchain_midgard",
  "https://gateway.liquify.com/chain/thorchain_midgard",
  "https://midgard.thorswap.net",
];
/** THORNode servers (live pool state, no history): the backup for prices when Midgard is down. */
const THORNODE = ["https://thorchain.ibs.team/api", "https://api-thorchain.rorcual.xyz", "https://gateway.liquify.com/chain/thorchain_api"];

// Only finished answers are kept between requests. Unfinished work (a promise) must never be
// shared: Cloudflare Workers refuses to settle a promise in any request but the one that
// created it, and the waiting page would show that error instead of prices.
const cache = new Map<string, { at: number; value: unknown }>();

/** True when `key` would need a fresh network read. */
function isStale(key: string, ttlMs: number) {
  const hit = cache.get(key);
  return !hit || Date.now() - hit.at > ttlMs;
}

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at <= ttlMs) return hit.value as T;
  try {
    const value = await load();
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    if (hit) return hit.value as T; // serve the last good answer through an outage
    throw e;
  }
}

async function midgard<T>(path: string): Promise<T> {
  let last: unknown = null;
  for (const base of MIDGARD) {
    try {
      const r = await fetch(base + path, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) { last = new Error(`HTTP ${r.status}`); continue; }
      const text = await r.text();
      if (!text.trimStart().startsWith("{") && !text.trimStart().startsWith("[")) { last = new Error("not JSON"); continue; }
      return JSON.parse(text) as T;
    } catch (e) {
      last = e;
    }
  }
  console.error("[thor-markets] every Midgard server failed", path.split("?")[0], String(last));
  throw new Error("THORChain market data is unavailable right now. Try again in a minute.");
}

type Pool = { asset: string; status: string; assetPrice: string; assetPriceUSD: string; assetDepth: string; volume24h: string };
type History<T> = { intervals: T[] };

const TTL = { pools: 30_000, hourly: 60_000, "15m": 60_000, "1h": 60_000, "4h": 120_000, "1d": 600_000, "1w": 1_800_000 } as const;

export type MarketRow = ThorMarket & {
  price: number | null;
  /** Pool liquidity in TSD (both sides). */
  liquidity: number | null;
  live: boolean;
  day: DayStats;
  /** Hourly closes for the last 24 hours. */
  spark: number[];
};

/** Which reads would hit the network (for rate limiting only cache misses). */
export function marketsNeedFetch(slug?: string, tf?: Timeframe): boolean {
  if (slug && tf) {
    const m = THOR_MARKETS.find((x) => x.slug === slug);
    return !m || isStale(`candles:${m.pool}:${tf}`, TTL[tf]) || isStale("pools", TTL.pools);
  }
  return isStale("pools", TTL.pools) || THOR_MARKETS.some((m) => isStale(`hourly:${m.pool}`, TTL.hourly));
}

type NodePool = { asset: string; status: string; balance_asset: string; asset_tor_price?: string };

/** Live pool prices straight from THORNode, shaped like Midgard's (no 24h volume there). */
async function nodePools(): Promise<Pool[]> {
  let last: unknown = null;
  for (const base of THORNODE) {
    try {
      const r = await fetch(base + "/thorchain/pools", { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) { last = new Error(`HTTP ${r.status}`); continue; }
      const list = (await r.json()) as NodePool[];
      if (!Array.isArray(list)) { last = new Error("not a list"); continue; }
      return list.map((p) => ({
        asset: p.asset,
        status: String(p.status).toLowerCase(),
        assetPrice: "0",
        assetPriceUSD: p.asset_tor_price ? String(Number(p.asset_tor_price) / 1e8) : "0",
        assetDepth: p.balance_asset,
        volume24h: "0",
      }));
    } catch (e) {
      last = e;
    }
  }
  console.error("[thor-markets] every THORNode server failed /thorchain/pools", String(last));
  throw new Error("THORChain market data is unavailable right now. Try again in a minute.");
}

function pools() {
  return cached("pools", TTL.pools, () => midgard<Pool[]>("/v2/pools").catch(() => nodePools()));
}

/** Last 25 hourly candles (with volume) for the 24-hour figures. */
function hourly(pool: string) {
  return cached(`hourly:${pool}`, TTL.hourly, async () => {
    const q = `${encodeURIComponent(pool)}?interval=hour&count=25`;
    const [d, s] = await Promise.all([
      midgard<History<Record<string, string>>>(`/v2/history/depths/${q}`),
      midgard<History<Record<string, string>>>(`/v2/history/swaps?pool=${q.replace("?", "&")}`).catch(() => ({ intervals: [] })),
    ]);
    return parseCandles(d.intervals, s.intervals);
  });
}

function rowFor(m: ThorMarket, p: Pool | undefined, h: Candle[] | null): MarketRow {
  const price = p ? Number(p.assetPriceUSD) : null;
  const ok = price != null && Number.isFinite(price) && price > 0;
  const depth = p ? (Number(p.assetDepth) / 1e8) * (price ?? 0) * 2 : null;
  return {
    ...m,
    price: ok ? price : null,
    liquidity: depth != null && Number.isFinite(depth) ? depth : null,
    live: p?.status === "available",
    day: dayStats(h ?? [], ok ? price : null),
    spark: (h ?? []).slice(-24).map((c) => c.close),
  };
}

/** Every primary market, with live price and 24-hour figures. */
export async function fetchThorMarkets(): Promise<MarketRow[]> {
  const all = await pools();
  const byAsset = new Map(all.map((p) => [p.asset, p]));
  const hist = await Promise.all(THOR_MARKETS.map((m) => hourly(m.pool).catch(() => null)));
  const rows = THOR_MARKETS.map((m, i) => rowFor(m, byAsset.get(m.pool), hist[i]));
  // BTC and ETH first, then by 24-hour volume.
  const [btc, eth, ...rest] = rows;
  return [btc, eth, ...rest.sort((a, b) => b.day.volume - a.day.volume)];
}

/** One market's live row plus candles for the chosen candle size. */
export async function fetchThorChart(slug: string, tf: Timeframe): Promise<{ market: MarketRow; candles: Candle[] }> {
  const m = THOR_MARKETS.find((x) => x.slug === slug);
  if (!m) throw new Error("Unknown market");
  const t = TIMEFRAMES[tf];
  const [all, h, candles] = await Promise.all([
    pools(),
    hourly(m.pool).catch(() => null),
    cached(`candles:${m.pool}:${tf}`, TTL[tf], async () => {
      // THORChain hands out at most 400 candles per read; longer spans are read in pages, newest first.
      const depths: Record<string, string>[] = [];
      const swaps: Record<string, string>[] = [];
      let to: string | null = null;
      for (let left = t.count; left > 0; ) {
        const n = Math.min(400, left);
        const q: string = `${encodeURIComponent(m.pool)}?interval=${t.interval}&count=${n}${to ? `&to=${to}` : ""}`;
        const [d, sw]: [History<Record<string, string>>, History<Record<string, string>>] = await Promise.all([
          midgard<History<Record<string, string>>>(`/v2/history/depths/${q}`),
          midgard<History<Record<string, string>>>(`/v2/history/swaps?pool=${q.replace("?", "&")}`).catch(() => ({ intervals: [] })),
        ]);
        depths.unshift(...d.intervals);
        swaps.unshift(...sw.intervals);
        left -= n;
        const first: string | undefined = d.intervals[0]?.startTime;
        if (d.intervals.length < n || !first || first === to) break; // reached the pool's start
        to = first;
      }
      depths.sort((a, b) => Number(a.startTime) - Number(b.startTime));
      return mergeCandles(parseCandles(depths, swaps), t.merge, INTERVAL_SECONDS[t.interval]);
    }),
  ]);
  const market = rowFor(m, all.find((p) => p.asset === m.pool), h);
  const size = INTERVAL_SECONDS[t.interval] * t.merge;
  return { market, candles: withLivePrice(candles, market.price, size, Math.floor(Date.now() / 1000)) };
}
