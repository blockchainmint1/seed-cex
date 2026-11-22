/**
 * Order-book readiness rules (pure, tested).
 *
 * Bobby, Nov 22 2026: an order from someone who can't pay must never sit on the
 * book. So Place order checks the payer first, and after a match is cancelled
 * before anything moved, only the side whose fault it was loses its order.
 */
import { getPair, type LegId } from "@/lib/chains";

export type OrderSide = "buy" | "sell";

/** The coin a member pays with when this order fills: sellers pay the base coin, buyers the quote coin. */
export function payLegOf(pairId: string, side: OrderSide): LegId {
  const pair = getPair(pairId);
  return side === "sell" ? pair.baseLeg : pair.quoteLeg;
}

/** How much of the pay coin the order needs: sellers the amount, buyers amount × price. */
export function payAmountOf(side: OrderSide, amount: number, price: number): number {
  return side === "sell" ? amount : amount * price;
}

export type OpenOrderRow = { pair: string; side: OrderSide; price: number | string; amount: number | string; filled: number | string };

/** What the member's other resting orders already promise to pay in this coin. */
export function committedOnLeg(orders: OpenOrderRow[], leg: LegId): number {
  let total = 0;
  for (const o of orders) {
    let payLeg: LegId;
    try {
      payLeg = payLegOf(o.pair, o.side);
    } catch {
      continue; // a retired market can't be filled
    }
    if (payLeg !== leg) continue;
    const left = Math.max(0, Number(o.amount) - Number(o.filled));
    total += payAmountOf(o.side, left, Number(o.price));
  }
  return total;
}

/** Plain reason the member can't place this order, or null. `balance` null = couldn't read it. */
export function orderCoverProblem(i: { symbol: string; balance: number | null; committed: number; need: number }): string | null {
  if (i.balance == null) return `Couldn't check your ${i.symbol} balance right now, so the order wasn't placed. Try again in a minute.`;
  const free = i.balance - i.committed;
  if (free + 1e-8 >= i.need) return null;
  if (i.committed > 1e-8) {
    return `This order needs ${fmt(i.need)} ${i.symbol}. Your trading pocket holds ${fmt(i.balance)} ${i.symbol}, and ${fmt(i.committed)} of it is already set aside for your other open orders and trades. Cancel one or add ${i.symbol} first.`;
  }
  return `This order needs ${fmt(i.need)} ${i.symbol}, but your trading pocket holds ${fmt(i.balance)} ${i.symbol}. Add ${i.symbol} first.`;
}

const fmt = (n: number) => String(Number(n.toFixed(8)));

/**
 * Whose problem stopped a leg before anything was sent:
 * payer = their setup or balance, receiver = no address to pay into,
 * network = our servers or a chain didn't answer (nobody's fault).
 */
export type PreflightFault = "payer" | "receiver" | "network";

export type FailedTrade = {
  makerId: string | null;
  takerId: string | null;
  makerOrderId: string | null;
  takerOrderId: string | null;
};

/**
 * After a match is cancelled before anything moved: which orders come off the book,
 * and which get their size back. A side with no owner (sample rows) can never pay.
 */
export function ordersAfterFailedPreflight(
  t: FailedTrade,
  f: { fault: PreflightFault; payer: string | null; receiver: string | null },
): { cancel: string[]; restore: string[] } {
  const orderOf = (who: string | null) =>
    who != null && who === t.makerId ? t.makerOrderId : who != null && who === t.takerId ? t.takerOrderId : null;
  let culpritOrder: string | null = null;
  if (f.fault === "payer") culpritOrder = f.payer == null ? (t.makerId == null ? t.makerOrderId : t.takerId == null ? t.takerOrderId : null) : orderOf(f.payer);
  if (f.fault === "receiver") culpritOrder = orderOf(f.receiver);
  const all = [t.makerOrderId, t.takerOrderId].filter((x): x is string => !!x);
  if (!culpritOrder) return { cancel: [], restore: all };
  return { cancel: [culpritOrder], restore: all.filter((id) => id !== culpritOrder) };
}

/**
 * Audit 2026-11-22 R2: a member whose matched orders keep failing on their own side
 * (coins moved out after placing, setup broken) stops being able to place orders for
 * a while. Only failures after an admin's clear count.
 */
export const REPEAT_FAILURE_LIMIT = 3;
export const REPEAT_FAILURE_WINDOW_MS = 24 * 3_600_000;

export function repeatFailurePause(i: { failedAtMs: number[]; clearedAtMs: number | null; nowMs: number }): { paused: boolean; count: number; untilMs: number | null } {
  const from = Math.max(i.nowMs - REPEAT_FAILURE_WINDOW_MS, i.clearedAtMs ?? -Infinity);
  const inWindow = i.failedAtMs.filter((t) => t > from && t <= i.nowMs).sort((a, b) => a - b);
  if (inWindow.length < REPEAT_FAILURE_LIMIT) return { paused: false, count: inWindow.length, untilMs: null };
  // The pause ends when enough old failures age out to drop below the limit.
  const untilMs = inWindow[inWindow.length - REPEAT_FAILURE_LIMIT]! + REPEAT_FAILURE_WINDOW_MS;
  return { paused: true, count: inWindow.length, untilMs };
}

export function repeatFailureMessage(untilMs: number): string {
  const until = new Date(untilMs).toISOString().replace("T", " ").slice(0, 16);
  return `Placing orders is paused on your account until ${until} UTC: ${REPEAT_FAILURE_LIMIT} of your orders matched in the last 24 hours but couldn't be paid from your trading pocket, so those trades were cancelled. Keep the coins for your open orders in your pocket. If this is a mistake, contact support from the Help page.`;
}

/** Who is to blame for a cancelled match (counted for the pause), or null when nobody is (network) or the side has no owner. */
export function failureCulprit(f: { fault: PreflightFault; payer: string | null; receiver: string | null }): string | null {
  if (f.fault === "payer") return f.payer;
  if (f.fault === "receiver") return f.receiver;
  return null;
}

/**
 * Audit R3: Place order may use a balance read from the last few seconds, but only to
 * let an order through. Any refusal is re-checked live first, so a fresh deposit is
 * never refused. The fill re-checks live either way.
 */
export function placeCheckNeedsLiveRead(problemWithRecentBalance: string | null): boolean {
  return problemWithRecentBalance != null;
}
