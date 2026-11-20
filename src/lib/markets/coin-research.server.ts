/**
 * Network reads for the coin research section of /markets/$slug. Read-only:
 * nothing here can move coins. Every answer goes through the shared display
 * cache, so thousands of visitors cost a handful of CoinMarketCap and THORChain
 * calls; a failed answer never replaces a good copy.
 */
import { shared } from "@/lib/cache/shared-cache.server";
import { CACHE_TIMES } from "@/lib/cache/shared-cache-rules";
import { swapCoin } from "@/lib/xchain/assets";
import { THOR_MARKETS, thorMarket } from "./thor-markets";
import {
  CMC_IDS, COST_SIZES, costRow, parseNews, parsePairs, parsePoolTrades, parseProfile, TRADE_LIMIT, TRADE_WINDOWS_SEC, tradeStep,
  type CoinProfile, type CostRow, type ExchangeRow, type NewsItem, type PoolTrade,
} from "./coin-research";

const CMC = "https://pro-api.coinmarketcap.com";

async function cmc<T>(path: string): Promise<T> {
  const key = process.env.CMC_API;
  if (!key) throw new Error("CoinMarketCap isn't set up.");
  const r = await fetch(CMC + path, { headers: { "X-CMC_PRO_API_KEY": key, Accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
  if (!r.ok) {
    console.error("[coin-research] CoinMarketCap", path.split("?")[0], r.status);
    throw new Error("CoinMarketCap didn't answer.");
  }
  return (await r.json()) as T;
}

type ById = { data?: Record<string, unknown> };

/** Global market data for every primary market, in one batch (three CoinMarketCap calls per refresh). */
export function coinProfiles(): Promise<Record<string, CoinProfile>> {
  return shared("research:profiles", { ...CACHE_TIMES.coinProfiles, good: (v) => Object.keys(v).length >= THOR_MARKETS.length / 2 }, async () => {
    const ids = Object.values(CMC_IDS).join(",");
    const [info, quotes, perf] = await Promise.all([
      cmc<ById>(`/v2/cryptocurrency/info?id=${ids}&aux=urls,logo,description,tags,date_added`),
      cmc<ById>(`/v2/cryptocurrency/quotes/latest?id=${ids}`),
      cmc<ById>(`/v2/cryptocurrency/price-performance-stats/latest?id=${ids}&time_period=all_time`).catch(() => ({ data: {} }) as ById),
    ]);
    const out: Record<string, CoinProfile> = {};
    for (const [slug, id] of Object.entries(CMC_IDS)) {
      const p = parseProfile(id, info.data?.[id], quotes.data?.[id], perf.data?.[id]);
      if (p) out[slug] = p;
    }
    return out;
  });
}

/** Other exchanges trading this coin (CoinMarketCap's spot markets, outliers dropped). */
export function coinPairs(slug: string): Promise<ExchangeRow[]> {
  const id = CMC_IDS[slug];
  if (!id) return Promise.resolve([]);
  return shared(`research:pairs:${slug}`, { ...CACHE_TIMES.coinPairs, good: (v) => v.length > 0 }, async () =>
    parsePairs(await cmc(`/v2/cryptocurrency/market-pairs/latest?id=${id}&limit=60&category=spot&sort=volume_24h_strict&aux=market_url`)),
  );
}

/** Latest headlines about this coin (CoinMarketCap's news feed). */
export function coinNews(slug: string): Promise<NewsItem[]> {
  const id = CMC_IDS[slug];
  if (!id) return Promise.resolve([]);
  return shared(`research:news:${slug}`, { ...CACHE_TIMES.coinNews, good: (v) => v.length > 0 }, async () =>
    parseNews(await cmc(`/v1/content/latest?id=${id}&limit=20&news_type=news&content_type=news`)),
  );
}

/** Real finished swaps in this coin's THORChain pool, newest first. */
export function poolTrades(slug: string): Promise<PoolTrade[]> {
  const m = thorMarket(slug);
  if (!m) return Promise.resolve([]);
  return shared(`research:trades:${slug}`, { ...CACHE_TIMES.poolTrades, good: (v) => v.length > 0 }, async () => {
    const { midgard } = await import("./thor-markets.server");
    const base = `/v2/actions?asset=${encodeURIComponent(m.pool)}&type=swap&limit=${TRADE_LIMIT}`;
    const now = Math.floor(Date.now() / 1000);
    let previous: unknown = null;
    let previousCount = 0;
    for (let i = 0; i < TRADE_WINDOWS_SEC.length; i++) {
      const raw = await midgard<{ actions?: unknown[] }>(`${base}&fromTimestamp=${now - TRADE_WINDOWS_SEC[i]!}`).catch(() => null);
      if (!raw) break;
      const count = Array.isArray(raw.actions) ? raw.actions.length : 0;
      const step = tradeStep(count, i, previousCount);
      if (step === "use") return parsePoolTrades(raw, m.pool);
      if (step === "use-previous") return parsePoolTrades(previous, m.pool);
      if (step === "slow") break;
      previous = raw;
      previousCount = count;
    }
    // Midgard's plain newest-first search is slow (often 10+ seconds); only the one claimed refresher waits.
    return parsePoolTrades(await midgard<unknown>(base, 25_000), m.pool);
  });
}

export type CostTable = { rows: CostRow[]; poolPrice: number | null; quotedAt: string };

/** Live THORChain quotes for buying this coin with $100 / $1k / $10k / $100k of USDC. */
export function costBySize(slug: string): Promise<CostTable> {
  const m = thorMarket(slug);
  const usdc = swapCoin("USDC");
  const to = m ? swapCoin(m.swapId) : null;
  if (!m || !usdc || !to) return Promise.resolve({ rows: [], poolPrice: null, quotedAt: new Date().toISOString() });
  return shared(`research:cost:${slug}`, { ...CACHE_TIMES.costQuotes, good: (v) => v.rows.some((r) => r.out != null) }, async () => {
    const [{ thorQuote }, { fetchThorMarkets }] = await Promise.all([import("@/lib/xchain/router.server"), import("./thor-markets.server")]);
    const row = (await fetchThorMarkets().catch(() => [])).find((r) => r.slug === slug);
    const poolPrice = row?.price ?? null;
    const rows = await Promise.all(
      COST_SIZES.map(async (usd) => {
        try {
          // THORChain counts every asset in 1e8 units, USDC included.
          const { route } = await thorQuote(usdc, to, BigInt(usd) * 100_000_000n, null);
          return costRow(usd, route.ok ? route.expectedOut : null, poolPrice, route.fees.totalBps, route.seconds, route.error);
        } catch {
          return costRow(usd, null, poolPrice, null, null, "THORChain didn't answer");
        }
      }),
    );
    return { rows, poolPrice, quotedAt: new Date().toISOString() };
  });
}
