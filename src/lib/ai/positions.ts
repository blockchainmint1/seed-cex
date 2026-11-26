/**
 * Position tracker for a Seeds AI basket (QA-0008). Pure, tested.
 * Only the plan's own finished Seeds trades count (Bobby, Nov 26 2026): coins sent in from outside never enter cost or score.
 * Cost is average cost in TSD: a buy adds the TSD paid; a sell removes the same share of cost it removes of units,
 * and the difference to the TSD received is realized gain.
 */
export type PosMove = { side: "buy" | "sell"; coin: string; amountIn: number; amountOut: number };
export type Position = { coin: string; units: number; cost: number; avgCost: number | null; value: number | null; unrealized: number | null; unrealizedPct: number | null; realized: number };
export type PositionSummary = { positions: Position[]; cost: number; value: number | null; unrealized: number | null; realized: number; total: number | null; totalPct: number | null };

export function positionsFrom(moves: PosMove[], prices: Record<string, number | undefined>): PositionSummary {
  const book = new Map<string, { units: number; cost: number; realized: number }>();
  for (const m of moves) {
    const b = book.get(m.coin) ?? { units: 0, cost: 0, realized: 0 };
    if (m.side === "buy") { b.units += m.amountOut; b.cost += m.amountIn; }
    else if (b.units > 0) {
      const sold = Math.min(m.amountIn, b.units);
      const share = b.cost * (sold / b.units);
      b.units -= sold; b.cost -= share; b.realized += m.amountOut - share;
      if (b.units < 1e-9) { b.units = 0; b.cost = 0; }
    }
    book.set(m.coin, b);
  }
  const positions: Position[] = [...book.entries()].map(([coin, b]) => {
    const price = prices[coin];
    const value = b.units > 0 ? (price != null && price > 0 ? b.units * price : null) : 0;
    const unrealized = value == null ? null : value - b.cost;
    return { coin, units: b.units, cost: b.cost, avgCost: b.units > 0 ? b.cost / b.units : null, value, unrealized,
      unrealizedPct: unrealized != null && b.cost > 0 ? (unrealized / b.cost) * 100 : null, realized: b.realized };
  });
  const cost = positions.reduce((s, p) => s + p.cost, 0);
  const realized = positions.reduce((s, p) => s + p.realized, 0);
  const priced = positions.every((p) => p.value != null);
  const value = priced ? positions.reduce((s, p) => s + (p.value ?? 0), 0) : null;
  const unrealized = value == null ? null : value - cost;
  const total = unrealized == null ? null : unrealized + realized;
  const bought = moves.filter((m) => m.side === "buy").reduce((s, m) => s + m.amountIn, 0);
  return { positions: positions.filter((p) => p.units > 0 || p.realized !== 0), cost, value, unrealized, realized, total, totalPct: total != null && bought > 0 ? (total / bought) * 100 : null };
}
