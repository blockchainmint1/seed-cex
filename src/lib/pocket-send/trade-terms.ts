/**
 * What an exchange trade's Telegram tap says (pure, tested). Audit 2026-11-22 R1:
 * with only the tap guarding a trade send (no two-factor-before-link for trades),
 * the tap must show the terms — buy or sell, how much, at what price, what comes
 * back — and warn when the price is far from the market (outside price first, Seeds' book second).
 */
export type TradeTermsInput = {
  /** The tapping member's own side of the trade. */
  memberSide: "buy" | "sell";
  baseSymbol: string;
  quoteSymbol: string;
  /** Base-coin amount of the trade. */
  amount: number;
  /** Quote coin per base coin. */
  price: number;
  /** Price to compare against (outside price first, else Seeds' own book); null = none. */
  reference: Reference;
};

/**
 * Where the comparison price came from. "outside" = CoinMarketCap / CoinGecko USD prices
 * (TSD = $1); "seeds" = Seeds' own last trade or book middle, which on a thin pair can be the
 * other side's own order (audit 2026-11-22 R1 follow-up), so the tap tells the member to check.
 */
export type Reference = { price: number; source: "outside" | "seeds" } | null;

/** How far from the recent price (in the member's bad direction) triggers the warning, in percent. */
export const FAR_FROM_MARKET_PCT = 5;

const num = (n: number) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 8 });

/** The side of a trade a member is on: the taker's side is stored on the trade; the maker is the opposite. */
export function memberSideOf(tradeSide: "buy" | "sell", memberIsTaker: boolean): "buy" | "sell" {
  return memberIsTaker ? tradeSide : tradeSide === "buy" ? "sell" : "buy";
}

/** One canonical text for a price, used both when asking and when spending the tap. */
export function priceKey(p: number | string): string {
  return String(Number(Number(p).toPrecision(15)));
}

export function tradeTerms(i: TradeTermsInput): { line: string; warning: string | null } {
  const total = i.amount * i.price;
  const each = `at ${num(i.price)} ${i.quoteSymbol} each`;
  const line = i.memberSide === "sell"
    ? `Sell ${num(i.amount)} ${i.baseSymbol} for ${num(total)} ${i.quoteSymbol} ${each}`
    : `Buy ${num(i.amount)} ${i.baseSymbol} for ${num(total)} ${i.quoteSymbol} ${each}`;
  const ref = i.reference && Number.isFinite(i.reference.price) && i.reference.price > 0 ? i.reference : null;
  if (ref == null) {
    return { line: `${line} (no outside price to compare — check this price yourself)`, warning: null };
  }
  const label = ref.source === "outside" ? "market price" : "Seeds price";
  const note = ref.source === "outside" ? "" : "; no outside price — check this price yourself";
  const withRef = `${line} (${label} ${num(ref.price)}${note})`;
  // Selling is bad when the price is below the reference; buying when above.
  const worsePct = i.memberSide === "sell" ? ((ref.price - i.price) / ref.price) * 100 : ((i.price - ref.price) / ref.price) * 100;
  if (worsePct <= FAR_FROM_MARKET_PCT + 1e-9) return { line: withRef, warning: null };
  const pct = Math.round(worsePct);
  return {
    line: withRef,
    warning: `This price is ${pct}% ${i.memberSide === "sell" ? "below" : "above"} the ${label}. Decline if you didn't place this order.`,
  };
}

/** USD value of one coin for the comparison: TSD is the platform dollar; USDC/USDT fall back to $1. */
export function usdOf(symbol: string, usd: (symbol: string) => number | null): number | null {
  const s = symbol.toUpperCase();
  if (s === "TSD") return 1;
  const p = usd(symbol) ?? usd(s);
  if (p != null && Number.isFinite(p) && p > 0) return p;
  return s === "USDC" || s === "USDT" ? 1 : null;
}

/** Outside price of the pair (quote coin per base coin) from USD prices; null when either side has none. */
export function outsidePrice(baseSymbol: string, quoteSymbol: string, usd: (symbol: string) => number | null): number | null {
  const b = usdOf(baseSymbol, usd);
  const q = usdOf(quoteSymbol, usd);
  return b != null && q != null ? b / q : null;
}

/** The comparison price: an outside price when Seeds has one, else Seeds' own book; null = none. */
export function pickReference(outside: number | null, seeds: number | null): Reference {
  if (outside != null && Number.isFinite(outside) && outside > 0) return { price: outside, source: "outside" };
  if (seeds != null && Number.isFinite(seeds) && seeds > 0) return { price: seeds, source: "seeds" };
  return null;
}

/** Seeds' own price for the pair: the last trade that actually traded, else the middle of the book. */
export function referencePrice(i: { lastPrinted: number | null; bestBid: number | null; bestAsk: number | null }): number | null {
  if (i.lastPrinted != null && i.lastPrinted > 0) return i.lastPrinted;
  if (i.bestBid != null && i.bestAsk != null && i.bestBid > 0 && i.bestAsk > 0) return (i.bestBid + i.bestAsk) / 2;
  return null;
}
