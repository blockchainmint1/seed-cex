/**
 * Seeds public REST API, v1.
 *
 * Shapes deliberately mirror the Binance spot API so existing bot code and
 * CCXT-style adapters need only a base-URL change. Differences are documented
 * in /api-docs — the big one being that Seeds never custodies funds, so
 * "balances" are on-chain balances of your own wallet, not exchange credits.
 */

import { PAIRS, getPair, type PairDef } from "@/lib/chains";
import { fetchOrderBook, fetchTape, fetchStats, type TapeEntry } from "@/lib/market.server";

/* ------------------------------- responses -------------------------------- */

const BASE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, x-seeds-apikey",
};

export function apiJson(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { ...BASE_HEADERS, ...(init.headers ?? {}) },
  });
}

/** Public market data is cacheable for a few seconds; private data never is. */
export function publicJson(body: unknown, seconds = 5) {
  return apiJson(body, { headers: { "cache-control": `public, max-age=${seconds}, s-maxage=${seconds}` } });
}

export function privateJson(body: unknown, status = 200) {
  return apiJson(body, { status, headers: { "cache-control": "no-store" } });
}

export const apiPreflight = () => new Response(null, { status: 204, headers: BASE_HEADERS });

/** Binance-style numeric error codes so bots can branch without string matching. */
export const ERR = {
  UNKNOWN: -1000,
  DISCONNECTED: -1001,
  UNAUTHORIZED: -1002,
  TOO_MANY_REQUESTS: -1003,
  IP_NOT_ALLOWED: -1004,
  UNEXPECTED_RESP: -1006,
  TIMESTAMP_OUT_OF_RECV_WINDOW: -1021,
  INVALID_SIGNATURE: -1022,
  ILLEGAL_CHARS: -1100,
  MANDATORY_PARAM_MISSING: -1102,
  BAD_SYMBOL: -1121,
  INVALID_QUANTITY: -1013,
  UNSUPPORTED_ORDER_COMBO: -1014,
  BAD_SIDE: -1130,
  ORDER_REJECTED: -2010,
  CANCEL_REJECTED: -2011,
  NO_SUCH_ORDER: -2013,
  BAD_API_KEY: -2015,
  INSUFFICIENT_AUTHORIZATION: -2019,
  ACTION_DISABLED: -2020,
} as const;

export function apiError(code: number, msg: string, status = 400) {
  return apiJson({ code, msg }, { status, headers: { "cache-control": "no-store" } });
}

/* -------------------------------- symbols --------------------------------- */

/** Binance-style concatenated ticker, e.g. TXCUSDC. */
export function symbolOf(p: PairDef): string {
  return `${p.base}${p.quote}`;
}

export function resolveSymbol(raw: string | null): PairDef | null {
  if (!raw) return null;
  const want = raw.trim().toUpperCase().replace(/[-/_]/g, "");
  return (
    PAIRS.find((p) => symbolOf(p) === want) ??
    PAIRS.find((p) => p.id.replace(/_/g, "") === want) ??
    PAIRS.find((p) => p.slug.replace(/-/g, "").toUpperCase() === want) ??
    null
  );
}

/** Order-entry constraints. Bots read these once at startup. */
export function filtersFor(p: PairDef) {
  const quoteStable = p.quote === "USDC" || p.quote === "USDT" || p.quote === "TSD";
  return {
    tickSize: quoteStable ? "0.00000100" : "0.00000001",
    stepSize: "0.00000001",
    minQty: "0.00010000",
    maxQty: "100000000.00000000",
    minPrice: "0.00000001",
    maxPrice: "1000000.00000000",
    minNotional: quoteStable ? "1.00000000" : "0.00100000",
  };
}

export function buildExchangeInfo() {
  return {
    timezone: "UTC",
    serverTime: Date.now(),
    exchange: "Seeds",
    custody: "non-custodial",
    rateLimits: [
      { rateLimitType: "REQUEST_WEIGHT", interval: "MINUTE", intervalNum: 1, limit: 1200 },
      { rateLimitType: "ORDERS", interval: "MINUTE", intervalNum: 1, limit: 100 },
    ],
    symbols: PAIRS.map((p) => {
      const f = filtersFor(p);
      return {
        symbol: symbolOf(p),
        seedsPairId: p.id,
        status: "TRADING",
        baseAsset: p.base,
        baseAssetPrecision: 8,
        quoteAsset: p.quote,
        quoteAssetPrecision: 8,
        baseSettlementChain: p.baseLeg,
        quoteSettlementChain: p.quoteLeg,
        orderTypes: ["LIMIT"],
        timeInForce: ["GTC"],
        isSpotTradingAllowed: true,
        isMarginTradingAllowed: false,
        makerCommission: "0",
        takerCommission: "0",
        filters: [
          { filterType: "PRICE_FILTER", minPrice: f.minPrice, maxPrice: f.maxPrice, tickSize: f.tickSize },
          { filterType: "LOT_SIZE", minQty: f.minQty, maxQty: f.maxQty, stepSize: f.stepSize },
          { filterType: "MIN_NOTIONAL", minNotional: f.minNotional },
        ],
      };
    }),
  };
}

/* ------------------------------ market data -------------------------------- */

const n8 = (v: number) => v.toFixed(8);

export async function buildDepth(pair: PairDef, limit: number) {
  const book = await fetchOrderBook(pair.id);
  return {
    lastUpdateId: Date.now(),
    symbol: symbolOf(pair),
    bids: book.bids.slice(0, limit).map((l) => [n8(l.price), n8(l.amount)]),
    asks: book.asks.slice(0, limit).map((l) => [n8(l.price), n8(l.amount)]),
  };
}

export async function buildTrades(pair: PairDef, limit: number) {
  const tape = await fetchTape(pair.id, limit);
  return tape.map((t) => ({
    id: t.id,
    price: n8(t.price),
    qty: n8(t.amount),
    quoteQty: n8(t.price * t.amount),
    time: new Date(t.createdAt).getTime(),
    isBuyerMaker: t.side === "sell",
  }));
}

export async function build24hr(pair: PairDef) {
  const [stats, book, tape] = await Promise.all([
    fetchStats(pair.id),
    fetchOrderBook(pair.id),
    fetchTape(pair.id, 500),
  ]);
  const cutoff = Date.now() - 86_400_000;
  const window = tape.filter((t) => new Date(t.createdAt).getTime() >= cutoff);
  const quoteVolume = window.reduce((s, t) => s + t.amount * t.price, 0);
  return {
    symbol: symbolOf(pair),
    lastPrice: n8(stats.last ?? 0),
    priceChangePercent: (stats.changePct ?? 0).toFixed(2),
    highPrice: n8(stats.high24h ?? 0),
    lowPrice: n8(stats.low24h ?? 0),
    volume: n8(stats.volume24h),
    quoteVolume: n8(quoteVolume),
    bidPrice: n8(book.bids[0]?.price ?? 0),
    bidQty: n8(book.bids[0]?.amount ?? 0),
    askPrice: n8(book.asks[0]?.price ?? 0),
    askQty: n8(book.asks[0]?.amount ?? 0),
    count: window.length,
    openTime: cutoff,
    closeTime: Date.now(),
  };
}

export async function buildAll24hr() {
  return Promise.all(PAIRS.map(build24hr));
}

export async function buildPrices() {
  const rows = await Promise.all(
    PAIRS.map(async (p) => ({ symbol: symbolOf(p), price: n8((await fetchStats(p.id)).last ?? 0) })),
  );
  return rows;
}

/* --------------------------------- klines ---------------------------------- */

export const INTERVALS: Record<string, number> = {
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "2h": 7_200_000,
  "4h": 14_400_000,
  "6h": 21_600_000,
  "12h": 43_200_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
};

/**
 * OHLCV buckets built from the trade tape. Empty buckets are skipped (bots
 * treat a gap as "no trades"), matching how thin markets behave elsewhere.
 */
export function bucketKlines(tape: TapeEntry[], intervalMs: number, limit: number) {
  type B = { open: number; high: number; low: number; close: number; vol: number; quote: number; n: number };
  const buckets = new Map<number, B>();
  // Tape arrives newest-first; walk oldest-first so open/close are correct.
  for (const t of [...tape].reverse()) {
    const ts = new Date(t.createdAt).getTime();
    const key = Math.floor(ts / intervalMs) * intervalMs;
    const b = buckets.get(key);
    if (!b) {
      buckets.set(key, { open: t.price, high: t.price, low: t.price, close: t.price, vol: t.amount, quote: t.amount * t.price, n: 1 });
    } else {
      b.high = Math.max(b.high, t.price);
      b.low = Math.min(b.low, t.price);
      b.close = t.price;
      b.vol += t.amount;
      b.quote += t.amount * t.price;
      b.n += 1;
    }
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-limit)
    .map(([openTime, b]) => [
      openTime,
      n8(b.open),
      n8(b.high),
      n8(b.low),
      n8(b.close),
      n8(b.vol),
      openTime + intervalMs - 1,
      n8(b.quote),
      b.n,
    ]);
}

export async function buildKlines(pair: PairDef, interval: string, limit: number) {
  const ms = INTERVALS[interval];
  if (!ms) return null;
  const tape = await fetchTape(pair.id, 1000);
  return bucketKlines(tape, ms, limit);
}

export { getPair };
