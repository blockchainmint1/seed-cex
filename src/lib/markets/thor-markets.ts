/**
 * Primary markets: the major coins THORChain trades, priced in TSD.
 *
 * Client-safe and pure (tested). TSD is treated as one US dollar for every
 * price and market figure, so a THORChain dollar price is the TSD price.
 * Network reads live in thor-markets.server.ts.
 */

export type ThorMarket = {
  /** URL segment under /markets, e.g. "btc-tsd". */
  slug: string;
  base: string;
  name: string;
  /** THORChain pool, e.g. "BTC.BTC". */
  pool: string;
  /** Coin id on the Swap page (src/lib/xchain/assets.ts). */
  swapId: string;
  /** Seeds order-book page, when this coin also has one. */
  book?: "/trade/btc-tsd" | "/trade/eth-tsd" | "/trade/ltc-tsd";
};

/** Every native coin with a THORChain pool. BTC and ETH lead; the rest sort by volume. */
export const THOR_MARKETS: ThorMarket[] = [
  { slug: "btc-tsd", base: "BTC", name: "Bitcoin", pool: "BTC.BTC", swapId: "BTC", book: "/trade/btc-tsd" },
  { slug: "eth-tsd", base: "ETH", name: "Ether", pool: "ETH.ETH", swapId: "ETH", book: "/trade/eth-tsd" },
  { slug: "bnb-tsd", base: "BNB", name: "BNB", pool: "BSC.BNB", swapId: "BNB" },
  { slug: "sol-tsd", base: "SOL", name: "Solana", pool: "SOL.SOL", swapId: "SOL" },
  { slug: "xrp-tsd", base: "XRP", name: "XRP", pool: "XRP.XRP", swapId: "XRP" },
  { slug: "doge-tsd", base: "DOGE", name: "Dogecoin", pool: "DOGE.DOGE", swapId: "DOGE" },
  { slug: "ltc-tsd", base: "LTC", name: "Litecoin", pool: "LTC.LTC", swapId: "LTC", book: "/trade/ltc-tsd" },
  { slug: "bch-tsd", base: "BCH", name: "Bitcoin Cash", pool: "BCH.BCH", swapId: "BCH" },
  { slug: "avax-tsd", base: "AVAX", name: "Avalanche", pool: "AVAX.AVAX", swapId: "AVAX" },
  { slug: "trx-tsd", base: "TRX", name: "TRON", pool: "TRON.TRX", swapId: "TRX" },
  { slug: "zec-tsd", base: "ZEC", name: "Zcash", pool: "ZEC.ZEC", swapId: "ZEC" },
  { slug: "atom-tsd", base: "ATOM", name: "Cosmos", pool: "GAIA.ATOM", swapId: "ATOM" },
];

export const THOR_MARKET_SLUGS = THOR_MARKETS.map((m) => m.slug) as [string, ...string[]];

export function thorMarket(slugOrBase: string): ThorMarket | null {
  const k = slugOrBase.toLowerCase();
  return THOR_MARKETS.find((m) => m.slug === k || m.base.toLowerCase() === k) ?? null;
}

/** Market for a Seeds order-book base coin (BTC, ETH, LTC), or null when THORChain doesn't trade it. */
export function thorMarketForBookBase(base: string): ThorMarket | null {
  return THOR_MARKETS.find((m) => m.book && m.base === base) ?? null;
}

/* -------------------------------- timeframes ------------------------------- */

export type Timeframe = "15m" | "1h" | "4h" | "1d" | "1w";
export type MidgardInterval = "5min" | "hour" | "day" | "week";

/** Candle size → THORChain history interval, how many of them to read, and how many to merge per candle. */
export const TIMEFRAMES: Record<Timeframe, { label: string; interval: MidgardInterval; count: number; merge: number; span: string }> = {
  "15m": { label: "15m", interval: "5min", count: 399, merge: 3, span: "last 33 hours" },
  "1h": { label: "1H", interval: "hour", count: 336, merge: 1, span: "last 14 days" },
  "4h": { label: "4H", interval: "hour", count: 400, merge: 4, span: "last 66 days" },
  "1d": { label: "1D", interval: "day", count: 365, merge: 1, span: "last year" },
  // THORChain's own weekly candles carry only one day's open/high/low, so weeks are built from daily candles.
  "1w": { label: "1W", interval: "day", count: 2000, merge: 7, span: "all history" },
};
export const TIMEFRAME_IDS = Object.keys(TIMEFRAMES) as [Timeframe, ...Timeframe[]];

/**
 * What the chart's buttons pick: how far back to look (CoinMarketCap-style).
 * Short ranges use the THORChain pool's own candles (the price Seeds' swaps get);
 * 3M, 1Y and All use CoinMarketCap's market-wide daily prices, because THORChain's
 * daily history has holes (pool halts) and one-off spikes that real markets never had.
 */
export type ChartRange = "1d" | "7d" | "1m" | "3m" | "1y" | "all";
export type RangeSpec =
  | { label: string; source: "pool"; interval: MidgardInterval; count: number; merge: number; span: string }
  | { label: string; source: "market"; days: number | null; weekly: boolean; span: string };
export const CHART_RANGES: Record<ChartRange, RangeSpec> = {
  "1d": { label: "1D", source: "pool", interval: "5min", count: 288, merge: 3, span: "last 24 hours · 15-minute candles · THORChain pool" },
  "7d": { label: "7D", source: "pool", interval: "hour", count: 168, merge: 1, span: "last 7 days · hourly candles · THORChain pool" },
  "1m": { label: "1M", source: "pool", interval: "hour", count: 720, merge: 4, span: "last 30 days · 4-hour candles · THORChain pool" },
  "3m": { label: "3M", source: "market", days: 90, weekly: false, span: "last 90 days · daily candles · market price" },
  "1y": { label: "1Y", source: "market", days: 365, weekly: false, span: "last year · daily candles · market price" },
  all: { label: "All", source: "market", days: null, weekly: true, span: "all history · weekly candles · market price" },
};
export const CHART_RANGE_IDS = Object.keys(CHART_RANGES) as [ChartRange, ...ChartRange[]];

/** Seconds in one candle of a range. */
export function rangeCandleSeconds(r: ChartRange): number {
  const s = CHART_RANGES[r];
  return s.source === "pool" ? INTERVAL_SECONDS[s.interval] * s.merge : s.weekly ? 7 * 86400 : 86400;
}

/* ---------------------------------- candles -------------------------------- */

/** One candle. `time` is the candle's start in unix seconds; prices in TSD (= USD); volume in TSD. */
export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };

type DepthInterval = { startTime?: string; openPriceUSD?: string; highPriceUSD?: string; lowPriceUSD?: string; closePriceUSD?: string };
type SwapInterval = { startTime?: string; totalVolumeUSD?: string };

const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : NaN;
};

/**
 * THORChain history → candles. Drops intervals with no real price (a pool's
 * first interval opens at 0) and keeps high/low consistent with open/close.
 * Swap volume arrives in US cents.
 */
export function parseCandles(depths: DepthInterval[], swaps: SwapInterval[] = []): Candle[] {
  const vol = new Map<number, number>();
  for (const s of swaps) {
    const t = num(s.startTime);
    const v = num(s.totalVolumeUSD);
    if (Number.isFinite(t) && Number.isFinite(v) && v > 0) vol.set(t, v / 100);
  }
  const out: Candle[] = [];
  for (const d of depths) {
    const time = num(d.startTime);
    const open = num(d.openPriceUSD);
    const close = num(d.closePriceUSD);
    let high = num(d.highPriceUSD);
    let low = num(d.lowPriceUSD);
    if (!Number.isFinite(time) || !(open > 0) || !(close > 0)) continue;
    if (!(high > 0)) high = Math.max(open, close);
    if (!(low > 0)) low = Math.min(open, close);
    high = Math.max(high, open, close);
    low = Math.min(low, open, close);
    out.push({ time, open, high, low, close, volume: vol.get(time) ?? 0 });
  }
  out.sort((a, b) => a.time - b.time);
  // One candle per start time.
  return out.filter((c, i) => i === 0 || c.time !== out[i - 1].time);
}

/** Unix time 0 was a Thursday; weeks start on Monday 00:00 UTC (4 days later). */
const WEEK_OFFSET = 4 * 86400;

/**
 * Merge every `n` consecutive candles into one (5-minute → 15-minute, hour → 4-hour,
 * day → week), aligned to the candle size; weeks start on Monday.
 */
export function mergeCandles(candles: Candle[], n: number, stepSeconds: number): Candle[] {
  if (n <= 1) return candles;
  const size = n * stepSeconds;
  const offset = size === 7 * 86400 ? WEEK_OFFSET : 0;
  const groups = new Map<number, Candle[]>();
  for (const c of candles) {
    const key = Math.floor((c.time - offset) / size) * size + offset;
    const g = groups.get(key);
    if (g) g.push(c); else groups.set(key, [c]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, g]) => ({
      time,
      open: g[0].open,
      close: g[g.length - 1].close,
      high: Math.max(...g.map((c) => c.high)),
      low: Math.min(...g.map((c) => c.low)),
      volume: g.reduce((s, c) => s + c.volume, 0),
    }));
}

/**
 * Bring the newest candle up to the live pool price while that candle is still
 * open (THORChain's history only settles a candle when it closes), so the
 * chart's last price matches the price shown above it.
 */
export function withLivePrice(candles: Candle[], live: number | null, candleSeconds: number, nowSec: number): Candle[] {
  const last = candles[candles.length - 1];
  if (!last || live == null || !(live > 0) || nowSec >= last.time + candleSeconds) return candles;
  const prev = candles[candles.length - 2];
  // Until a candle closes, THORChain repeats the previous candle's prices; start it fresh from the previous close.
  const copied = prev && prev.open === last.open && prev.high === last.high && prev.low === last.low && prev.close === last.close;
  const open = copied ? prev.close : last.open;
  const high = copied ? Math.max(open, live) : Math.max(last.high, live);
  const low = copied ? Math.min(open, live) : Math.min(last.low, live);
  return [...candles.slice(0, -1), { ...last, open, high, low, close: live }];
}

export const INTERVAL_SECONDS: Record<MidgardInterval, number> = { "5min": 300, hour: 3600, day: 86400, week: 604800 };

/**
 * CoinMarketCap daily OHLCV → candles (oldest first, one per day). Rows with a
 * missing or non-positive price are dropped; high/low always cover open/close.
 */
export function parseCmcOhlcv(raw: unknown): Candle[] {
  const quotes = (raw as { data?: { quotes?: unknown[] } } | null)?.data?.quotes;
  if (!Array.isArray(quotes)) return [];
  const out: Candle[] = [];
  for (const q of quotes) {
    const r = q as { time_open?: string; quote?: { USD?: Record<string, unknown> } };
    const usd = r.quote?.USD;
    const t = r.time_open ? Date.parse(r.time_open) : NaN;
    if (!usd || !Number.isFinite(t)) continue;
    const open = num(usd["open"]);
    const close = num(usd["close"]);
    if (!(open > 0) || !(close > 0)) continue;
    const hi = num(usd["high"]);
    const lo = num(usd["low"]);
    const vol = num(usd["volume"]);
    out.push({
      time: Math.floor(t / 1000 / 86400) * 86400,
      open,
      close,
      high: Math.max(hi > 0 ? hi : 0, open, close),
      low: Math.min(lo > 0 ? lo : Infinity, open, close),
      volume: vol > 0 ? vol : 0,
    });
  }
  out.sort((a, b) => a.time - b.time);
  return out.filter((c, i) => i === 0 || c.time !== out[i - 1]!.time);
}

/**
 * Daily market candles → the chosen long range: the last `days` days, or every
 * day merged into Monday-start weeks for "All".
 */
export function marketRangeCandles(daily: Candle[], r: ChartRange): Candle[] {
  const s = CHART_RANGES[r];
  if (s.source !== "market") return [];
  if (s.weekly) return mergeCandles(daily, 7, 86400);
  return s.days == null ? daily : daily.slice(-s.days);
}

/**
 * Keep the last candle on the live price: update it while it's still open, or
 * start the next one (opening at the previous close) once its period has ended.
 * Only the very next period is started, so stale history never gets a fake jump.
 */
export function withLiveCandle(candles: Candle[], live: number | null, sizeSec: number, nowSec: number): Candle[] {
  const last = candles[candles.length - 1];
  if (!last || live == null || !(live > 0)) return candles;
  if (nowSec < last.time + sizeSec) return withLivePrice(candles, live, sizeSec, nowSec);
  if (nowSec >= last.time + 2 * sizeSec) return candles;
  const open = last.close;
  return [...candles, { time: last.time + sizeSec, open, high: Math.max(open, live), low: Math.min(open, live), close: live, volume: 0 }];
}

export type DayStats = { changePct: number | null; high: number | null; low: number | null; volume: number };

/** 24-hour change, high, low and volume from hourly candles (the last 24 of them). */
export function dayStats(hourly: Candle[], last: number | null): DayStats {
  const day = hourly.slice(-24);
  if (!day.length) return { changePct: null, high: null, low: null, volume: 0 };
  const open = day[0].open;
  const now = last ?? day[day.length - 1].close;
  return {
    changePct: open > 0 ? ((now - open) / open) * 100 : null,
    high: Math.max(now, ...day.map((c) => c.high)),
    low: Math.min(now, ...day.map((c) => c.low)),
    volume: day.reduce((s, c) => s + c.volume, 0),
  };
}

/** Sensible price decimals: $63,286.32 · $1.2871 · $0.06550 · $0.00030112. */
export function priceDecimals(price: number): number {
  const p = Math.abs(price);
  if (p >= 1000) return 2;
  if (p >= 1) return 4;
  if (p >= 0.01) return 5;
  return 8;
}

export function fmtTsd(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price)) return "—";
  const d = priceDecimals(price);
  return price.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Compact TSD amount for volume and liquidity: 1.2K, 88.3M. */
export function fmtTsdCompact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: v >= 1000 ? 1 : 0 });
}
