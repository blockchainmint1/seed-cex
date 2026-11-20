/**
 * Coin research pages (CoinMarketCap-style section under each /markets chart).
 *
 * Client-safe and pure (tested). Turns raw answers from CoinMarketCap and
 * THORChain's Midgard into the small shapes the page shows, and decides what
 * is trustworthy enough to show at all. Network reads live in
 * coin-research.server.ts; nothing here can move coins.
 */

/** CoinMarketCap coin ids for every primary market. Ids, never tickers: tickers repeat ("Bitcoin Base" is also BTC). */
export const CMC_IDS: Record<string, number> = {
  "btc-tsd": 1,
  "eth-tsd": 1027,
  "bnb-tsd": 1839,
  "sol-tsd": 5426,
  "xrp-tsd": 52,
  "doge-tsd": 74,
  "ltc-tsd": 2,
  "bch-tsd": 1831,
  "avax-tsd": 5805,
  "trx-tsd": 1958,
  "zec-tsd": 1437,
  "atom-tsd": 3794,
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Only plain web links; anything else (javascript:, data:, relative) is dropped. */
export function safeUrl(u: unknown): string | null {
  const s = str(u);
  if (!s) return null;
  try {
    const url = new URL(s);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A link with its query string and fragment removed (other sites' referral codes are not ours to pass on). */
export function cleanLink(u: unknown): string | null {
  const s = safeUrl(u);
  if (!s) return null;
  const url = new URL(s);
  url.search = "";
  url.hash = "";
  return url.toString();
}

/* ------------------------------ global market data ----------------------------- */

export type CoinProfile = {
  cmcId: number;
  name: string;
  symbol: string;
  cmcSlug: string | null;
  logo: string | null;
  description: string | null;
  tags: string[];
  dateAdded: string | null;
  rank: number | null;
  price: number | null;
  marketCap: number | null;
  fdv: number | null;
  dominance: number | null;
  volume24h: number | null;
  change: { h1: number | null; d1: number | null; d7: number | null; d30: number | null; d90: number | null };
  circulating: number | null;
  total: number | null;
  max: number | null;
  ath: { price: number; at: string | null } | null;
  atl: { price: number; at: string | null } | null;
  links: { label: string; url: string }[];
};

type Info = Record<string, unknown> & { urls?: Record<string, unknown> };

const LINK_KINDS: [key: string, label: string, max: number][] = [
  ["website", "Website", 1],
  ["technical_doc", "Whitepaper", 1],
  ["source_code", "Source code", 1],
  ["explorer", "Explorer", 3],
  ["twitter", "X (Twitter)", 1],
  ["reddit", "Reddit", 1],
  ["message_board", "Forum", 1],
];

function linksOf(info: Info): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const [key, label, max] of LINK_KINDS) {
    const list = Array.isArray(info.urls?.[key]) ? (info.urls![key] as unknown[]) : [];
    let n = 0;
    for (const raw of list) {
      const url = safeUrl(raw);
      if (!url || seen.has(url) || n >= max) continue;
      seen.add(url);
      n++;
      out.push({ label: max > 1 && list.length > 1 ? `${label} ${n}` : label, url });
    }
  }
  return out;
}

/** CoinMarketCap's description, plain text, without the stale "last known price…" sentences it appends. */
export function cleanDescription(text: unknown): string | null {
  const s = str(text);
  if (!s) return null;
  const kept = s
    .replace(/\s+/g, " ")
    .split(/(?<=\.)\s+/)
    .filter((sentence) => !/last known price|current supply of|currently trading on|active market\(s\)|traded over the last|more information can be found at/i.test(sentence))
    .join(" ")
    .trim();
  return kept || null;
}

/** One coin from the three CoinMarketCap answers (info, quotes, all-time performance). Null without info and a quote. */
export function parseProfile(cmcId: number, info: unknown, quote: unknown, perf: unknown): CoinProfile | null {
  const i = (info && typeof info === "object" ? info : null) as Info | null;
  const q = (quote && typeof quote === "object" ? quote : null) as Record<string, any> | null;
  if (!i || !q || num(i.id) !== cmcId || num(q.id) !== cmcId) return null;
  const usd = (q.quote?.USD ?? {}) as Record<string, unknown>;
  const at = ((perf as any)?.periods?.all_time?.quote?.USD ?? null) as Record<string, unknown> | null;
  const high = num(at?.high);
  const low = num(at?.low);
  const pos = (v: unknown) => { const n = num(v); return n != null && n > 0 ? n : null; };
  return {
    cmcId,
    name: str(i.name) ?? "",
    symbol: str(i.symbol) ?? "",
    cmcSlug: str(i.slug),
    logo: safeUrl(i.logo),
    description: cleanDescription(i.description),
    tags: Array.isArray(i["tag-names"]) ? (i["tag-names"] as unknown[]).map(str).filter((t): t is string => !!t && !/portfolio|ecosystem$/i.test(t)).slice(0, 8) : [],
    dateAdded: str(i.date_added),
    rank: pos(q.cmc_rank),
    price: pos(usd.price),
    marketCap: pos(usd.market_cap),
    fdv: pos(usd.fully_diluted_market_cap),
    dominance: pos(usd.market_cap_dominance),
    volume24h: pos(usd.volume_24h),
    change: {
      h1: num(usd.percent_change_1h),
      d1: num(usd.percent_change_24h),
      d7: num(usd.percent_change_7d),
      d30: num(usd.percent_change_30d),
      d90: num(usd.percent_change_90d),
    },
    circulating: pos(q.circulating_supply),
    total: pos(q.total_supply),
    max: pos(q.max_supply),
    ath: high != null && high > 0 ? { price: high, at: str(at?.high_timestamp) } : null,
    atl: low != null && low > 0 ? { price: low, at: str(at?.low_timestamp) } : null,
    links: linksOf(i),
  };
}

/** How far the price sits below its all-time high, in percent (negative), or null. */
export function fromAth(price: number | null, ath: number | null | undefined): number | null {
  if (price == null || ath == null || !(ath > 0) || !(price > 0)) return null;
  return ((price - ath) / ath) * 100;
}

/** Share of the maximum supply already in circulation, 0–100, or null when there is no cap. */
export function supplyShare(circulating: number | null, max: number | null): number | null {
  if (circulating == null || max == null || !(max > 0)) return null;
  return Math.min(100, Math.max(0, (circulating / max) * 100));
}

/* ------------------------------- other exchanges ------------------------------- */

export type ExchangeRow = {
  exchange: string;
  pair: string;
  price: number;
  volume24h: number;
  /** Dollars of orders within 2% below / above the price on that exchange. */
  depthDown: number | null;
  depthUp: number | null;
  url: string | null;
};

/**
 * Where else the coin trades: spot markets only, CoinMarketCap's suspected
 * outliers and anything it excludes from price or volume dropped, one row per
 * exchange (its busiest pair), busiest first.
 */
export function parsePairs(raw: unknown, limit = 12): ExchangeRow[] {
  const d = (raw as any)?.data;
  const pairs: unknown[] = Array.isArray(d) ? (d[0]?.market_pairs ?? []) : (d?.market_pairs ?? []);
  const best = new Map<string, ExchangeRow>();
  for (const p of pairs as any[]) {
    if (!p || p.outlier_detected === 1 || (Array.isArray(p.exclusions) && p.exclusions.length)) continue;
    if (p.category && p.category !== "spot") continue;
    const exchange = str(p.exchange?.name);
    const pair = str(p.market_pair);
    const usd = p.quote?.USD ?? {};
    const price = num(usd.price);
    const volume = num(usd.volume_24h);
    if (!exchange || !pair || price == null || !(price > 0) || volume == null || !(volume > 0)) continue;
    const row: ExchangeRow = {
      exchange,
      pair,
      price,
      volume24h: volume,
      depthDown: num(usd.depth_negative_two),
      depthUp: num(usd.depth_positive_two),
      url: cleanLink(p.market_url),
    };
    const key = exchange.toLowerCase();
    const prev = best.get(key);
    if (!prev || prev.volume24h < row.volume24h) best.set(key, row);
  }
  return [...best.values()].sort((a, b) => b.volume24h - a.volume24h).slice(0, limit);
}

/* ------------------------------------ news ------------------------------------ */

export type NewsItem = { title: string; summary: string | null; source: string; url: string; at: string };

/** Latest headlines: real titles and web links only, newest first, one per title. */
export function parseNews(raw: unknown, limit = 8): NewsItem[] {
  const list: unknown[] = Array.isArray((raw as any)?.data) ? (raw as any).data : [];
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const n of list as any[]) {
    const title = str(n?.title);
    const url = safeUrl(n?.source_url);
    const at = str(n?.released_at) ?? str(n?.created_at);
    if (!title || !url || !at || Number.isNaN(Date.parse(at))) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // Feeds append "The post … appeared first on …"; that's not part of the story.
    const summary = str(str(n?.subtitle)?.replace(/\s*The post .* appeared first on .*$/i, "").trim());
    out.push({ title, summary: summary ? summary.slice(0, 280) : null, source: str(n?.source_name) ?? "CoinMarketCap", url, at });
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
}

/* ------------------------------- recent trades ------------------------------- */

export type PoolTrade = {
  /** Unix milliseconds. */
  at: number;
  /** "buy" = someone bought this coin from the pool; "sell" = sold it into the pool. */
  side: "buy" | "sell";
  /** Dollar (= TSD) price THORChain paid or charged. */
  price: number;
  /** Whole coins. */
  amount: number;
  usd: number;
  txid: string | null;
};

type Coin = { asset?: string; amount?: string };
type Leg = { coins?: Coin[]; txID?: string };

const coinsOf = (legs: unknown, pool: string): number =>
  (Array.isArray(legs) ? (legs as Leg[]) : [])
    .flatMap((l) => (Array.isArray(l?.coins) ? l.coins : []))
    .filter((c) => c?.asset === pool)
    .reduce((s, c) => s + (num(c.amount) ?? 0) / 1e8, 0);

/**
 * Midgard swap actions → finished trades in one pool. Only completed swaps
 * count (a streaming swap still under way has no final amount yet); a swap
 * with this coin on both sides is skipped; prices come from THORChain's own
 * record of that swap.
 */
export function parsePoolTrades(raw: unknown, pool: string, limit = 40): PoolTrade[] {
  const list: unknown[] = Array.isArray((raw as any)?.actions) ? (raw as any).actions : [];
  const out: PoolTrade[] = [];
  const seen = new Set<string>();
  for (const a of list as any[]) {
    if (a?.status !== "success" || a?.type !== "swap") continue;
    const sold = coinsOf(a.in, pool);
    const bought = coinsOf(a.out, pool);
    if ((sold > 0) === (bought > 0)) continue;
    const side = sold > 0 ? "sell" : "buy";
    const swap = a.metadata?.swap ?? {};
    const price = num(side === "sell" ? swap.inPriceUSD : swap.outPriceUSD);
    const amount = side === "sell" ? sold : bought;
    const ns = num(a.date);
    if (price == null || !(price > 0) || !(amount > 0) || ns == null) continue;
    const txid = str(a.in?.[0]?.txID);
    const key = `${txid ?? ""}:${ns}:${side}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ at: Math.floor(ns / 1e6), side, price, amount, usd: price * amount, txid });
  }
  return out.sort((x, y) => y.at - x.at).slice(0, limit);
}

/**
 * Midgard answers fast only when given a start time, but then returns the
 * OLDEST swaps after it, not the newest. So Seeds asks for growing windows
 * (10 min, 1 h, 6 h, 48 h). A window that comes back with room to spare holds
 * every swap in it, newest included. A full window after a smaller one would
 * skip the swaps in between, so the smaller (complete) one is used instead.
 */
export const TRADE_WINDOWS_SEC = [600, 3_600, 6 * 3_600, 48 * 3_600] as const;
export const TRADE_LIMIT = 50;
export const TRADE_ENOUGH = 20;

export type TradeStep = "use" | "use-previous" | "widen" | "slow";

export function tradeStep(count: number, index: number, previousCount: number): TradeStep {
  if (count >= TRADE_LIMIT) return index === 0 ? "use" : previousCount > 0 ? "use-previous" : "slow";
  if (count >= TRADE_ENOUGH) return "use";
  if (index >= TRADE_WINDOWS_SEC.length - 1) return count > 0 ? "use" : "slow";
  return "widen";
}

/* ------------------------------- cost by size ------------------------------- */

/** Dollar (= TSD) amounts the cost table quotes. */
export const COST_SIZES = [100, 1_000, 10_000, 100_000] as const;

export type CostRow = {
  usd: number;
  /** Coins THORChain says you'd receive, or null when it wouldn't quote this size. */
  out: number | null;
  /** Average price paid per coin. */
  avgPrice: number | null;
  /** How much worse than the pool price that average is, in percent. */
  slipPct: number | null;
  /** THORChain's own fee + slip figure, in percent. */
  feePct: number | null;
  /** Minutes the swap would take (streaming swaps split big orders up). */
  minutes: number | null;
  error: string | null;
};

export function costRow(usd: number, out: number | null, poolPrice: number | null, totalBps: number | null, seconds: number | null, error: string | null): CostRow {
  if (out == null || !(out > 0)) return { usd, out: null, avgPrice: null, slipPct: null, feePct: null, minutes: null, error: error ?? "No quote" };
  const avgPrice = usd / out;
  const slipPct = poolPrice != null && poolPrice > 0 ? Math.max(0, ((avgPrice - poolPrice) / poolPrice) * 100) : null;
  return {
    usd,
    out,
    avgPrice,
    slipPct,
    feePct: totalBps != null && Number.isFinite(totalBps) ? totalBps / 100 : null,
    minutes: seconds != null && seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : null,
    error: null,
  };
}

/* ---------------------------------- videos ---------------------------------- */

/** YouTube video id from any normal YouTube link (watch, youtu.be, shorts, live, embed), or null. */
export function youtubeId(input: unknown): string | null {
  const s = str(input);
  if (!s) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let url: URL;
  try {
    url = new URL(s.startsWith("http") ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = url.pathname.match(/^\/(shorts|live|embed|v)\/([^/?#]+)/);
      id = m?.[2] ?? null;
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
