/**
 * "Network fees" step of the setup guide (pure rules, tested; no I/O).
 *
 * Seeds takes no fee, but Ethereum and Base charge a small network fee in ETH,
 * paid from the member's own pocket. The guide suggests how much to keep on each
 * and the one way to get it that works for this member right now.
 */

export const FEE_PREP = {
  /** Suggested ETH to keep on Ethereum, in dollars (also TSD Bridge's 10 TSD minimum). */
  ethereum: { suggestUsd: 10, lowUsd: 2 },
  /** Suggested ETH to keep on Base, in dollars; Base fees are a fraction of a cent. */
  base: { suggestUsd: 1, lowUsd: 0.25 },
  /** TSD converted on Ethereum by the guide's button. */
  convertTsd: 10,
} as const;

/**
 * Seeds can't swap TSD into ETH on Base yet: it would have to send that ETH back
 * to TSD later, and Base sending isn't built. Until then Base fee money is sent in.
 */
export const BASE_FROM_TSD = false;

export type FeeLevel = "enough" | "low" | "empty" | "unknown";
export type FeeAction = "none" | "convert" | "send_in";

/** How the pocket's ETH on one network compares with what the guide asks for. */
export function feeLevel(haveEth: number | null, ethUsd: number | null, lowUsd: number): FeeLevel {
  if (haveEth == null || !Number.isFinite(haveEth)) return "unknown";
  if (haveEth <= 0) return "empty";
  if (ethUsd == null || !(ethUsd > 0)) return "unknown";
  return haveEth * ethUsd >= lowUsd ? "enough" : "low";
}

/**
 * Ethereum: convert TSD only when that conversion can actually run for this member —
 * TSD swaps are open to them and its own Ethereum fee is paid (by their pocket or by
 * Seeds' fee wallet). Otherwise the first ETH has to be sent in.
 */
export function ethereumAction(p: { level: FeeLevel; convertBlocker: string | null; firstFeePaid: boolean }): FeeAction {
  if (p.level === "enough") return "none";
  if (p.convertBlocker) return "send_in";
  return p.firstFeePaid ? "convert" : "send_in";
}

/** Base: send in until Seeds can swap TSD into ETH on Base. */
export function baseAction(level: FeeLevel, fromTsd: boolean = BASE_FROM_TSD): FeeAction {
  if (level === "enough") return "none";
  return fromTsd ? "convert" : "send_in";
}

/** Roughly how many swaps an amount of ETH pays for at today's fee. */
export function swapsCovered(haveEth: number | null, perSwapEth: number | null): number | null {
  if (haveEth == null || perSwapEth == null || !(perSwapEth > 0) || !(haveEth >= 0)) return null;
  return Math.floor(haveEth / perSwapEth);
}
