/**
 * Primary markets table: one row shape for THORChain markets and Seeds' own
 * home-coin order books (TXC, ISK, ZCU), plus the column sort.
 *
 * Pure and client-safe (tested). Home-coin rows come only from Seeds' own
 * order book and trade list — never from THORChain, which doesn't trade them.
 */

/** Seeds order books shown in Primary markets, in display order. */
export const HOME_COIN_MARKETS = [
  { pairId: "TSD_TXC", slug: "tsd-txc", base: "TXC", name: "TEXITcoin" },
  { pairId: "ISK_TSD", slug: "isk-tsd", base: "ISK", name: "Iskandercoin" },
  { pairId: "ZCU_TSD", slug: "zcu-tsd", base: "ZCU", name: "ZeroChill" },
] as const;

export type HomeCoinPairId = (typeof HOME_COIN_MARKETS)[number]["pairId"];

export type PrimaryRow = {
  key: string;
  base: string;
  name: string;
  /** "thor" rows open /markets/$slug; "seeds" rows open the Seeds order book. */
  source: "thor" | "seeds";
  slug: string;
  price: number | null;
  /** True when `price` is the order book's mid (no trade has happened yet). */
  priceIsMid: boolean;
  changePct: number | null;
  high: number | null;
  low: number | null;
  /** 24-hour volume in TSD. */
  volume: number;
  /** TSD value available to trade (pool depth, or orders resting on the book). */
  liquidity: number | null;
  live: boolean;
  spark: number[];
};

export type BookTrade = { price: number; amount: number; createdAt: string };
export type BookSide = { price: number; amount: number }[];

const DAY_MS = 86_400_000;

/**
 * One Seeds order book → a Primary markets row. Only trades from the last 24
 * hours count toward change, high/low and volume; the change is measured from
 * the last trade before that window (or the window's first trade). With no
 * trade ever, the price is the book's mid when both sides have orders.
 */
export function bookRow(
  m: { slug: string; base: string; name: string },
  tradesNewestFirst: BookTrade[],
  book: { bids: BookSide; asks: BookSide },
  nowMs: number,
): PrimaryRow {
  const cutoff = nowMs - DAY_MS;
  const trades = tradesNewestFirst.filter((t) => t.price > 0 && t.amount > 0 && Number.isFinite(Date.parse(t.createdAt)));
  const inDay = trades.filter((t) => Date.parse(t.createdAt) >= cutoff);
  const before = trades.find((t) => Date.parse(t.createdAt) < cutoff) ?? null;
  const last = trades[0]?.price ?? null;

  let changePct: number | null = null;
  if (inDay.length) {
    const ref = before?.price ?? inDay[inDay.length - 1]!.price;
    changePct = ref > 0 && last != null ? ((last - ref) / ref) * 100 : null;
  } else if (before) {
    changePct = 0;
  }

  const bestBid = book.bids[0]?.price ?? null;
  const bestAsk = book.asks[0]?.price ?? null;
  const mid = last == null && bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null;
  const side = (s: BookSide) => s.reduce((sum, l) => sum + l.price * l.amount, 0);
  const resting = side(book.bids) + side(book.asks);
  const prices = inDay.map((t) => t.price);

  return {
    key: `seeds:${m.slug}`,
    base: m.base,
    name: m.name,
    source: "seeds",
    slug: m.slug,
    price: last ?? mid,
    priceIsMid: last == null && mid != null,
    changePct,
    high: prices.length ? Math.max(...prices) : null,
    low: prices.length ? Math.min(...prices) : null,
    volume: inDay.reduce((s, t) => s + t.price * t.amount, 0),
    liquidity: book.bids.length || book.asks.length ? resting : null,
    live: true,
    spark: inDay.map((t) => t.price).reverse(),
  };
}

export type SortKey = "market" | "price" | "change" | "high" | "volume" | "liquidity";
export type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

/** Name sorts A→Z first; numbers sort biggest first. A third click goes back to the default order. */
export function nextSort(current: SortState, key: SortKey): SortState {
  const first = key === "market" ? "asc" : "desc";
  if (!current || current.key !== key) return { key, dir: first };
  if (current.dir === first) return { key, dir: first === "asc" ? "desc" : "asc" };
  return null;
}

function value(r: PrimaryRow, key: SortKey): number | string | null {
  switch (key) {
    case "market": return r.base.toUpperCase();
    case "price": return r.price;
    case "change": return r.changePct;
    case "high": return r.high;
    case "volume": return r.volume;
    case "liquidity": return r.liquidity;
  }
}

/** Sort rows by a column; rows without a figure always go last. Ties keep the default order. */
export function sortRows(rows: PrimaryRow[], sort: SortState): PrimaryRow[] {
  if (!sort) return rows;
  const sign = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const va = value(a.r, sort.key);
      const vb = value(b.r, sort.key);
      const na = va == null || (typeof va === "number" && !Number.isFinite(va));
      const nb = vb == null || (typeof vb === "number" && !Number.isFinite(vb));
      if (na || nb) return na === nb ? a.i - b.i : na ? 1 : -1;
      const c = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return c ? c * sign : a.i - b.i;
    })
    .map((x) => x.r);
}
