/**
 * What an exchange trade's Telegram tap says (pure, tested). Audit 2026-11-22 R1:
 * with only the tap guarding a trade send (no two-factor-before-link for trades),
 * the tap must show the terms — buy or sell, how much, at what price, what comes
 * back — and warn when the price is far from the recent price.
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
  /** Recent price to compare against (last printed trade, else book middle); null = none. */
  reference: number | null;
};

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
  const ref = i.reference != null && Number.isFinite(i.reference) && i.reference > 0 ? i.reference : null;
  if (ref == null) {
    return { line: `${line} (no recent price to compare)`, warning: null };
  }
  const withRef = `${line} (recent price ${num(ref)})`;
  // Selling is bad when the price is below the recent price; buying when above.
  const worsePct = i.memberSide === "sell" ? ((ref - i.price) / ref) * 100 : ((i.price - ref) / ref) * 100;
  if (worsePct <= FAR_FROM_MARKET_PCT + 1e-9) return { line: withRef, warning: null };
  const pct = Math.round(worsePct);
  return {
    line: withRef,
    warning: i.memberSide === "sell"
      ? `This price is ${pct}% below the recent price. Decline if you didn't place this order.`
      : `This price is ${pct}% above the recent price. Decline if you didn't place this order.`,
  };
}

/** Recent price for the warning: the last trade that actually traded, else the middle of the book. */
export function referencePrice(i: { lastPrinted: number | null; bestBid: number | null; bestAsk: number | null }): number | null {
  if (i.lastPrinted != null && i.lastPrinted > 0) return i.lastPrinted;
  if (i.bestBid != null && i.bestAsk != null && i.bestBid > 0 && i.bestAsk > 0) return (i.bestBid + i.bestAsk) / 2;
  return null;
}
