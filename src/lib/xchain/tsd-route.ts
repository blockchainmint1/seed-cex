/**
 * TSD routes (pure, tested): turn TSD into any THORChain coin, or back, in one step
 * for the member. TSD Bridge (the single TSD issuer) converts TSD <-> USDC on
 * Ethereum 1:1; THORChain swaps that USDC <-> the coin. Every leg starts and ends in
 * the member's own trading pocket, so Seeds never holds the coins in between.
 *
 *   buy  (TSD -> coin): TSD pocket -> TSD Bridge cash-out -> USDC in EVM pocket -> THORChain -> coin in own pocket
 *   sell (coin -> TSD): coin pocket -> THORChain -> USDC in EVM pocket -> TSD Bridge mint -> TSD in TXC pocket
 */
import type { PocketCoin } from "@/lib/pockets/coins";
import type { SwapCoin } from "./assets";
import { receivePocket, sendSource, SEND_PILOT_ADMIN_ONLY, SWAP_LIMITS, type LinkLike } from "./send-rules";

export type RouteDirection = "buy" | "sell";

/** Ethereum USDC: the only coin the bridge pays out that THORChain also trades. */
export const BRIDGE_USDC_ID = "USDC";
export const BRIDGE_USDC_CONTRACT = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
export const BRIDGE_CHAIN = "ethereum";

export const TSD_ROUTE = {
  /** TSD Bridge's own minimum per order. */
  minTsd: 10,
  /** The THORChain leg runs ~20–40 min after the member saw the price; allow this much drift before asking again. */
  legTolerance: 0.02,
  /** Refuse a bridge order whose fee is above this, whatever the bridge says. */
  maxBridgeFeeBps: 100,
  /** A recorded transaction the network still doesn't know after this long needs a person. */
  lostTxMinutes: 20,
} as const;

/** Stages a route moves through. Terminal: done, refunded, failed, kept_usdc. */
export type RouteStage =
  | "reserved" // row created, nothing has moved
  | "sending_tsd" // bridge order created; TSD send being signed
  | "bridging" // TSD Bridge is converting (either direction)
  | "swapping" // USDC (buy) or coin (sell) ready; THORChain leg about to be sent
  | "gas_pending" // Seeds sent a little ETH for the network fee; waiting for it to confirm
  | "swap_sent" // THORChain leg in flight
  | "minting" // sell: USDC arrived; sending it to TSD Bridge
  | "needs_ok" // price moved more than legTolerance; waiting for the member
  | "done"
  | "refunded"
  | "kept_usdc"
  | "failed";

export const TERMINAL_STAGES: RouteStage[] = ["done", "refunded", "kept_usdc", "failed"];
export const isTerminal = (s: string) => (TERMINAL_STAGES as string[]).includes(s);

/** Steps the member sees, in order, for the progress tracker. */
export function routeSteps(direction: RouteDirection, coinSymbol: string): string[] {
  if (coinSymbol === "USDC") return direction === "buy" ? ["TSD sent", "TSD Bridge pays USDC", "USDC in your pocket"] : ["USDC sent", "TSD Bridge issues TSD", "TSD in your pocket"];
  return direction === "buy"
    ? ["TSD sent", "TSD Bridge pays USDC", "THORChain swaps", `${coinSymbol} in your pocket`]
    : [`${coinSymbol} sent`, "THORChain swaps to USDC", "TSD Bridge issues TSD", "TSD in your pocket"];
}

/**
 * Index into routeSteps of the step in progress (all done = steps.length).
 * Pass the stage the route returns to while it waits for gas (resume_stage).
 */
export function stepIndex(direction: RouteDirection, stage: string, direct: boolean): number {
  const total = direct ? 3 : 4;
  if (stage === "done") return total;
  if (direction === "buy") {
    if (stage === "reserved" || stage === "sending_tsd") return 0;
    if (stage === "bridging") return 1;
    return 2;
  }
  if (direct) return stage === "bridging" ? 1 : 0;
  if (stage === "reserved" || stage === "swapping") return 0;
  if (stage === "swap_sent") return 1;
  return 2;
}

/** Bridge fee applied to an amount (USD-pegged both sides), rounded down to cents' hundredths. */
export function afterBridgeFee(amount: number, feeBps: number): number {
  if (!(amount > 0) || !Number.isFinite(feeBps) || feeBps < 0) return 0;
  return Math.floor(amount * (1 - feeBps / 10_000) * 1e6) / 1e6;
}

/** The coin on the far side of the route, if Seeds can do this route at all. */
export function routeCoinProblem(direction: RouteDirection, coin: SwapCoin): string | null {
  if (coin.id === BRIDGE_USDC_ID) return null;
  if (!coin.protocols.includes("thorchain")) return `${coin.symbol} on ${coin.network} isn't on THORChain.`;
  if (direction === "buy" && !receivePocket(coin)) return `Your trading pocket can't hold ${coin.symbol} on ${coin.network} yet.`;
  // Never sell a one-way trip: whatever a member buys, Seeds must be able to swap back to TSD.
  if (direction === "buy" && !sendSource(coin)) return `Seeds can't swap ${coin.symbol} on ${coin.network} back to TSD yet, so it isn't offered.`;
  if (direction === "sell" && !sendSource(coin)) return `Seeds can't send ${coin.symbol} on ${coin.network} yet.`;
  return null;
}

/** Pockets a route needs: TXC (holds TSD), EVM (USDC in between), and the coin's own pocket. */
export function routePockets(direction: RouteDirection, coin: SwapCoin): PocketCoin[] {
  const need = new Set<PocketCoin>(["TXC", "EVM"]);
  const own = direction === "buy" ? receivePocket(coin) : sendSource(coin)?.pocket;
  if (own) need.add(own);
  return [...need];
}

/** First reason this member can't start this route now, or null. */
export function routeBlocker(p: {
  direction: RouteDirection;
  coin: SwapCoin;
  link: LinkLike;
  isAdmin: boolean;
  amountUsd: number | null;
  tsdAmount: number | null;
}): string | null {
  const coinProblem = routeCoinProblem(p.direction, p.coin);
  if (coinProblem) return coinProblem;
  if (SEND_PILOT_ADMIN_ONLY && !p.isAdmin) return "TSD swaps are in a small test with the Seeds team first. They open to members after that.";
  if (!p.link) return "Link your HME Wallet trading pocket first (Profile).";
  if (p.link.mode !== "access" || !p.link.hasKey) return "Your pocket is linked in approve-every-trade mode. TSD swaps need instant access for now.";
  const missing = routePockets(p.direction, p.coin).filter((x) => !p.link!.pockets.includes(x));
  if (missing.length) return `Your linked pocket is missing ${missing.join(", ")}. Re-link it in HME Wallet to add them.`;
  if (p.tsdAmount != null && p.tsdAmount < TSD_ROUTE.minTsd) return `TSD Bridge's minimum is ${TSD_ROUTE.minTsd} TSD.`;
  if (p.amountUsd == null) return "No live price for this coin, so the limit can't be checked.";
  if (p.amountUsd > SWAP_LIMITS.perSwapUsd) return `Swaps are limited to $${SWAP_LIMITS.perSwapUsd} each during the test.`;
  return null;
}

/** THORChain leg: fresh output for the actual amount may be at most legTolerance below what the member saw. */
export function legPriceOk(shownOut: number, shownIn: number, actualIn: number, freshOut: number): boolean {
  if (!(shownOut > 0 && shownIn > 0 && actualIn > 0)) return false;
  const expected = (shownOut * actualIn) / shownIn;
  return freshOut >= expected * (1 - TSD_ROUTE.legTolerance);
}

/* ------------------------- TSD Bridge response checks ------------------------- */

export type BridgeOrder = {
  id?: string;
  status?: string;
  depositAddress?: string;
  sendTo?: string;
  payoutAddress?: string | null;
  recipient?: string | null;
  depositTokenContract?: string | null;
  chain?: string;
  amountExpected?: number | null;
  amountReceived?: number | null;
  payoutAmount?: number | null;
  feeBps?: number;
  mintFeeBps?: number;
  memo?: null | string;
  releaseTxHash?: string | null;
  mintTxid?: string | null;
  refundTxid?: string | null;
  expiresAt?: string | null;
  error?: string | null;
};

const TXC_LEGACY = /^T[1-9A-HJ-NP-Za-km-z]{25,34}$/;
const EVM = /^0x[0-9a-fA-F]{40}$/;
const same = (a?: string | null, b?: string | null) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/** A cash-out order must pay exactly the member's EVM pocket, on Ethereum, for the amount we asked, at a fee we accept. */
export function redeemOrderProblem(o: BridgeOrder, want: { payout: string; amount: number; maxFeeBps: number }): string | null {
  const deposit = o.depositAddress ?? o.sendTo ?? "";
  if (!o.id) return "TSD Bridge returned no order id.";
  if (!TXC_LEGACY.test(deposit)) return "TSD Bridge returned an unexpected deposit address.";
  if (!same(o.payoutAddress, want.payout)) return "TSD Bridge would pay a different address than your pocket.";
  if ((o.chain ?? BRIDGE_CHAIN) !== BRIDGE_CHAIN) return "TSD Bridge would pay on the wrong network.";
  if (o.amountExpected != null && Math.abs(o.amountExpected - want.amount) > 1e-8) return "TSD Bridge recorded a different amount.";
  if (o.memo) return "TSD Bridge asked for a memo; TSD never needs one.";
  const fee = Number(o.feeBps ?? 0);
  if (!Number.isFinite(fee) || fee < 0 || fee > want.maxFeeBps) return `TSD Bridge's fee (${fee / 100}%) is above what you were shown.`;
  return null;
}

/** A mint order must issue TSD to the member's own TXC pocket and take Ethereum USDC. */
export function mintOrderProblem(o: BridgeOrder, want: { recipient: string; maxFeeBps: number }): string | null {
  const deposit = o.depositAddress ?? o.sendTo ?? "";
  if (!o.id) return "TSD Bridge returned no order id.";
  if (!EVM.test(deposit)) return "TSD Bridge returned an unexpected deposit address.";
  if (!same(o.recipient, want.recipient)) return "TSD Bridge would issue the TSD to a different address than your pocket.";
  if (!same(o.depositTokenContract, BRIDGE_USDC_CONTRACT)) return "TSD Bridge asked for a different coin than Ethereum USDC.";
  const fee = Number(o.mintFeeBps ?? o.feeBps ?? 0);
  if (!Number.isFinite(fee) || fee < 0 || fee > want.maxFeeBps) return `TSD Bridge's fee (${fee / 100}%) is above what you were shown.`;
  return null;
}

export type BridgeProgress = "waiting" | "paid" | "refunded" | "failed";

/** Map the bridge's partner status vocabulary. "paid" needs the payout transaction too. */
export function bridgeProgress(o: BridgeOrder, direction: RouteDirection): BridgeProgress {
  if (o.refundTxid || o.status === "refunded") return "refunded";
  if (o.status === "failed" || o.status === "expired") return "failed";
  const proof = direction === "buy" ? o.releaseTxHash : (o.mintTxid ?? o.releaseTxHash);
  if (o.status === "released" && proof) return "paid";
  return "waiting";
}

/* ------------------------------ gas top-up math ------------------------------ */

/** Seeds-paid Ethereum network fee for one route: caps are re-checked in the database. */
export const GAS_LIMITS = { perRouteUsd: 5, dailyUsd: 100 } as const;

/** How much ETH (wei) to send so the pocket can pay `needWei`, or 0n when it already can. */
export function gasTopUpWei(needWei: bigint, haveWei: bigint): bigint {
  if (needWei <= haveWei) return 0n;
  return needWei - haveWei;
}
