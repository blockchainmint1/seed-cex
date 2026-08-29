/**
 * CoinMarketCap-compatible public market data.
 *
 * Implements CMC's "Ideal API" endpoint set (/summary, /assets, /ticker,
 * /orderbook/:market_pair, /trades/:market_pair) on top of our internal
 * order book. All numbers are plain JSON numbers; timestamps are unix ms.
 */

import { PAIRS, type PairDef } from "./chains";
import { fetchOrderBook, fetchTape, fetchStats, type TapeEntry } from "./market.server";

/** CMC market_pair ticker, e.g. "TXC_USDC". */
export function cmcPair(p: PairDef): string {
  return `${p.base}_${p.quote}`;
}

export function resolvePair(marketPair: string): PairDef | null {
  const want = marketPair.trim().toUpperCase().replace(/[-/]/g, "_");
  return (
    PAIRS.find((p) => cmcPair(p) === want) ??
    PAIRS.find((p) => p.id.toUpperCase() === want) ??
    PAIRS.find((p) => p.slug.toUpperCase().replace(/-/g, "_") === want) ??
    null
  );
}

const ASSET_META: Record<string, { name: string; canWithdraw: boolean; canDeposit: boolean; type: string }> = {
  TXC: { name: "TEXITcoin", canWithdraw: true, canDeposit: true, type: "coin" },
  TSD: { name: "Texas Stable Dollar", canWithdraw: true, canDeposit: true, type: "token" },
  USDC: { name: "USD Coin", canWithdraw: true, canDeposit: true, type: "token" },
  USDT: { name: "Tether USD", canWithdraw: true, canDeposit: true, type: "token" },
  LTC: { name: "Litecoin", canWithdraw: true, canDeposit: true, type: "coin" },
  ISK: { name: "Iskandercoin", canWithdraw: true, canDeposit: true, type: "coin" },
  ZCU: { name: "ZeroChill", canWithdraw: true, canDeposit: true, type: "coin" },
};

export function buildAssets() {
  const out: Record<string, unknown> = {};
  for (const sym of new Set(PAIRS.flatMap((p) => [p.base, p.quote]))) {
    const meta = ASSET_META[sym];
    out[sym] = {
      name: meta?.name ?? sym,
      unified_cryptoasset_id: null,
      can_withdraw: meta?.canWithdraw ?? true,
      can_deposit: meta?.canDeposit ?? true,
      min_withdraw: null,
      max_withdraw: null,
      maker_fee: 0,
      taker_fee: 0,
      type: meta?.type ?? "coin",
    };
  }
  return out;
}

type PairSnapshot = {
  pair: PairDef;
  stats: Awaited<ReturnType<typeof fetchStats>>;
  book: Awaited<ReturnType<typeof fetchOrderBook>>;
  tape: TapeEntry[];
};

async function snapshot(pair: PairDef): Promise<PairSnapshot> {
  const [stats, book, tape] = await Promise.all([
    fetchStats(pair.id),
    fetchOrderBook(pair.id),
    fetchTape(pair.id, 200),
  ]);
  return { pair, stats, book, tape };
}

export async function allSnapshots(): Promise<PairSnapshot[]> {
  return Promise.all(PAIRS.map(snapshot));
}

function quoteVolume(tape: TapeEntry[]): number {
  const cutoff = Date.now() - 86_400_000;
  const recent = tape.filter((t) => new Date(t.createdAt).getTime() >= cutoff);
  // Mirror fetchStats: with no fills in the last 24h, fall back to the tape
  // window so base_volume and quote_volume always describe the same trades.
  const window = recent.length ? recent : tape;
  return window.reduce((sum, t) => sum + t.amount * t.price, 0);
}


/** /summary — one flat array of every market. */
export function toSummary(snaps: PairSnapshot[]) {
  return snaps.map(({ pair, stats, book, tape }) => ({
    trading_pairs: cmcPair(pair),
    base_currency: pair.base,
    quote_currency: pair.quote,
    last_price: stats.last ?? 0,
    lowest_ask: book.asks[0]?.price ?? 0,
    highest_bid: book.bids[0]?.price ?? 0,
    base_volume: stats.volume24h,
    quote_volume: quoteVolume(tape),
    price_change_percent_24h: stats.changePct ?? 0,
    highest_price_24h: stats.high24h ?? 0,
    lowest_price_24h: stats.low24h ?? 0,
  }));
}

/** /ticker — keyed by market_pair, CMC's canonical 24h ticker shape. */
export function toTicker(snaps: PairSnapshot[]) {
  const out: Record<string, unknown> = {};
  for (const { pair, stats, tape } of snaps) {
    out[cmcPair(pair)] = {
      base_id: null,
      quote_id: null,
      last_price: stats.last ?? 0,
      base_volume: stats.volume24h,
      quote_volume: quoteVolume(tape),
      isFrozen: 0,
    };
  }
  return out;
}

export async function toOrderBook(pair: PairDef, depth: number, level: 1 | 2 | 3) {
  const book = await fetchOrderBook(pair.id);
  const cut = (levels: { price: number; amount: number }[]) => {
    const rows = level === 1 ? levels.slice(0, 1) : levels;
    return rows.slice(0, depth > 0 ? depth : rows.length).map((l) => [l.price, l.amount]);
  };
  return {
    timestamp: Date.now(),
    bids: cut(book.bids),
    asks: cut(book.asks),
  };
}

export async function toTrades(pair: PairDef, limit: number) {
  const tape = await fetchTape(pair.id, limit);
  return tape.map((t) => ({
    trade_id: t.id,
    price: t.price,
    base_volume: t.amount,
    quote_volume: t.amount * t.price,
    timestamp: new Date(t.createdAt).getTime(),
    type: t.side,
  }));
}

/** Shared response helper: JSON, CORS-open, short shared cache. */
export function marketJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=10, s-maxage=10",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

export const corsPreflight = () =>
  new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
