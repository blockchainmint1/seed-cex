/**
 * Two-step swaps (pure, client-safe, tested): one Telegram tap, two hops.
 *
 * dex_then_x: a pool swap on Ethereum into a plain coin, then THORChain/Maya to the coin wanted.
 * x_then_dex: THORChain/Maya into a plain coin in the member's own EVM pocket, then a pool swap.
 * Every hop pays the member's own pocket. The second hop starts only when a fresh price for
 * the coins that actually arrived still clears the agreed minimum; otherwise Seeds stops and the
 * in-between coin stays in the pocket (kept_mid).
 */
export type TwoStepStatus =
  | "awaiting_approval" | "approved" | "leg1" | "mid" | "leg2"
  | "done" | "failed" | "refunded" | "kept_mid" | "declined" | "expired" | "cancelled";

export const TWO_STEP_TERMINAL: readonly TwoStepStatus[] = ["done", "failed", "refunded", "kept_mid", "declined", "expired", "cancelled"];
export const isTwoStepTerminal = (s: string) => (TWO_STEP_TERMINAL as readonly string[]).includes(s);

/** The first hop runs right after the tap: its fresh price may be at most this much worse than shown. */
export const FIRST_HOP_TOLERANCE = 0.02;
/** How long a hop may wait on a busy network before Seeds stops and leaves the coins in the pocket. */
export const HOP_WAIT_MINUTES = 30;

export const TWO_STEP_LABEL: Record<TwoStepStatus, string> = {
  awaiting_approval: "Waiting for your Telegram tap",
  approved: "Starting",
  leg1: "Step 1 of 2",
  mid: "Starting step 2",
  leg2: "Step 2 of 2",
  done: "Delivered",
  failed: "Stopped",
  refunded: "Refunded",
  kept_mid: "Stopped — coins in your pocket",
  declined: "Declined",
  expired: "Not approved in time",
  cancelled: "Cancelled",
};

/** Step names shown in My swaps. */
export function twoStepSteps(i: { direction: "dex_then_x" | "x_then_dex"; symbolIn: string; mid: string; symbolOut: string; pool: string; swapper: string }): string[] {
  const first = i.direction === "dex_then_x" ? `${i.pool}: ${i.symbolIn} → ${i.mid}` : `${i.swapper}: ${i.symbolIn} → ${i.mid}`;
  const second = i.direction === "dex_then_x" ? `${i.swapper}: ${i.mid} → ${i.symbolOut}` : `${i.pool}: ${i.mid} → ${i.symbolOut}`;
  return ["Telegram tap", first, second];
}

/** How many of those steps are finished. */
export function twoStepIndex(status: string): number {
  switch (status) {
    case "awaiting_approval": return 0;
    case "approved": case "leg1": return 1;
    case "mid": case "leg2": return 2;
    case "done": return 3;
    default: return 0;
  }
}

/** The first hop may go ahead at this fresh price. */
export function firstHopOk(shownMid: number, freshMid: number, tolerance = FIRST_HOP_TOLERANCE): boolean {
  return Number.isFinite(shownMid) && shownMid > 0 && Number.isFinite(freshMid) && freshMid >= shownMid * (1 - tolerance);
}

/** The second hop may go ahead: a fresh price for what actually arrived still clears the agreed minimum. */
export function secondHopOk(freshOut: number, agreedMin: number): boolean {
  return Number.isFinite(freshOut) && Number.isFinite(agreedMin) && agreedMin > 0 && freshOut >= agreedMin;
}

/** Coins handed to the second hop: what the first hop paid, never more than the pocket holds. */
export function midToHandOn(reported: number | null, pocketBalance: number | null): number | null {
  if (reported == null || !(reported > 0)) return null;
  if (pocketBalance == null) return null;
  return Math.min(reported, pocketBalance);
}
