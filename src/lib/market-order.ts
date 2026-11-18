/**
 * Market orders: pure rules shared by the order ticket, the server and the API.
 *
 * A market order takes the best prices on the book right now. It never rests:
 * whatever can't fill within the member's price protection is cancelled.
 * Price protection = how far the worst fill may sit from today's best price.
 */

export type Side = "buy" | "sell";

/** Price-protection choices on the ticket, in percent. */
export const MARKET_SLIPPAGE_OPTIONS = [1, 2, 5] as const;
export const DEFAULT_MARKET_SLIPPAGE_PCT = 2;
/** Hard ceiling the server accepts (API callers included). */
export const MAX_MARKET_SLIPPAGE_PCT = 10;
/** Average price this far from the best price gets a "heads up" note. */
export const PRICE_MOVE_NOTE_PCT = 1;
/** Book this far from the outside reference price gets a note. */
export const REFERENCE_GAP_NOTE_PCT = 5;

const EPS = 1e-8;
const round8 = (n: number) => Math.round(n * 1e8) / 1e8;

export function clampSlippagePct(pct: unknown): number {
  const n = typeof pct === "number" ? pct : Number(pct);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MARKET_SLIPPAGE_PCT;
  return Math.min(MAX_MARKET_SLIPPAGE_PCT, Math.max(0.1, n));
}

/**
 * Worst price a market order may fill at. Buys may pay up to best × (1 + s);
 * sells accept down to best × (1 − s). Rounded toward the stricter side.
 */
export function protectionPrice(side: Side, bestPrice: number, slippagePct: number): number {
  if (!Number.isFinite(bestPrice) || bestPrice <= 0) throw new Error("No best price");
  const s = clampSlippagePct(slippagePct) / 100;
  if (side === "buy") return Math.max(bestPrice, Math.floor(bestPrice * (1 + s) * 1e8) / 1e8);
  return Math.min(bestPrice, Math.max(1e-8, Math.ceil(bestPrice * (1 - s) * 1e8) / 1e8));
}

export type BookLevel = { price: number; amount: number };

export type MarketEstimate = {
  side: Side;
  requested: number;
  /** Base amount that can fill within the protection price. */
  filled: number;
  /** Base amount that would be cancelled. */
  unfilled: number;
  /** Quote amount paid (buy) or received (sell). */
  total: number;
  avgPrice: number | null;
  bestPrice: number | null;
  worstPrice: number | null;
  limitPrice: number | null;
  /** How far the average sits from the best price, in percent (always ≥ 0). */
  avgMovePct: number;
  levelsUsed: number;
};

/** Best-first order: lowest asks for a buy, highest bids for a sell. */
export function sortBestFirst(side: Side, levels: BookLevel[]): BookLevel[] {
  return levels
    .filter((l) => Number.isFinite(l.price) && l.price > 0 && Number.isFinite(l.amount) && l.amount > EPS)
    .sort((a, b) => (side === "buy" ? a.price - b.price : b.price - a.price));
}

/**
 * Walk the opposite side of the book. `levels` are the asks for a buy and the
 * bids for a sell, in any order.
 */
export function estimateMarketFill(
  side: Side,
  levels: BookLevel[],
  amount: number,
  slippagePct: number = DEFAULT_MARKET_SLIPPAGE_PCT,
): MarketEstimate {
  const sorted = sortBestFirst(side, levels);
  const best = sorted[0]?.price ?? null;
  const limit = best != null ? protectionPrice(side, best, slippagePct) : null;
  let remaining = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const requested = remaining;
  let total = 0;
  let worst: number | null = null;
  let used = 0;

  if (limit != null) {
    for (const l of sorted) {
      if (remaining <= EPS) break;
      const crosses = side === "buy" ? l.price <= limit + EPS : l.price >= limit - EPS;
      if (!crosses) break;
      const take = Math.min(remaining, l.amount);
      total += take * l.price;
      remaining -= take;
      worst = l.price;
      used += 1;
    }
  }

  const filled = round8(requested - remaining);
  const avg = filled > EPS ? total / filled : null;
  const move = avg != null && best != null ? (Math.abs(avg - best) / best) * 100 : 0;
  return {
    side,
    requested,
    filled,
    unfilled: round8(Math.max(0, remaining)),
    total: round8(total),
    avgPrice: avg,
    bestPrice: best,
    worstPrice: worst,
    limitPrice: limit,
    avgMovePct: move,
    levelsUsed: used,
  };
}

/** Take the member's own resting orders out of the book (they never self-trade). */
export function withoutOwnOrders(
  levels: BookLevel[],
  own: Array<{ price: number; remaining: number }>,
): BookLevel[] {
  const mine = new Map<number, number>();
  for (const o of own) mine.set(o.price, (mine.get(o.price) ?? 0) + o.remaining);
  return levels
    .map((l) => ({ price: l.price, amount: round8(l.amount - (mine.get(l.price) ?? 0)) }))
    .filter((l) => l.amount > EPS);
}

export type MarketNote = { tone: "info" | "warn"; text: string };

/**
 * Plain-English heads-ups for the confirmation popup. `canPlace` is false
 * only when nothing at all can fill.
 */
export function marketOrderNotes(
  est: MarketEstimate,
  ctx: { base: string; quote: string; refPrice?: number | null; fmt?: (n: number) => string },
): { canPlace: boolean; notes: MarketNote[] } {
  const f = ctx.fmt ?? ((n: number) => String(round8(n)));
  const notes: MarketNote[] = [];
  const buying = est.side === "buy";

  if (est.bestPrice == null || est.filled <= EPS) {
    notes.push({
      tone: "warn",
      text: buying
        ? `Nobody is selling ${ctx.base} right now, so a market buy has nothing to fill against. Try a limit order instead and it will wait on the book.`
        : `Nobody is buying ${ctx.base} right now, so a market sell has nothing to fill against. Try a limit order instead and it will wait on the book.`,
    });
    return { canPlace: false, notes };
  }

  if (est.unfilled > EPS) {
    notes.push({
      tone: "warn",
      text: `Only about ${f(est.filled)} of your ${f(est.requested)} ${ctx.base} can fill within your price protection. The other ${f(est.unfilled)} ${ctx.base} will be cancelled, not left waiting.`,
    });
  }

  if (est.avgMovePct >= PRICE_MOVE_NOTE_PCT) {
    notes.push({
      tone: "warn",
      text: `Your order is bigger than the best ${buying ? "seller" : "buyer"} alone, so it reaches into ${est.levelsUsed} price levels. Your average price is about ${est.avgMovePct.toFixed(1)}% ${buying ? "above" : "below"} the best price.`,
    });
  }

  const ref = ctx.refPrice;
  if (ref != null && Number.isFinite(ref) && ref > 0 && est.avgPrice != null) {
    const gap = ((est.avgPrice - ref) / ref) * 100;
    const bad = buying ? gap : -gap;
    if (bad >= REFERENCE_GAP_NOTE_PCT) {
      notes.push({
        tone: "warn",
        text: `You'd ${buying ? "pay" : "receive"} about ${Math.abs(gap).toFixed(1)}% ${buying ? "more" : "less"} than the outside market price (${f(ref)} ${ctx.quote}). Seeds' order book is still small, so prices can differ.`,
      });
    }
  }

  return { canPlace: true, notes };
}

/** Final status of a market order once matching is done. Never open/partial. */
export function marketFinalStatus(requested: number, filled: number): "filled" | "cancelled" {
  return filled >= requested - EPS ? "filled" : "cancelled";
}
