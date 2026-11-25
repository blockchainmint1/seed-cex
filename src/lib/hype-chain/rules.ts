/**
 * One-tap HYPE swaps (pure, client-safe, tested): any coin <-> ETH (Ethereum) <-> HYPE (HyperEVM).
 *
 * to_hype:   coin/TSD -> ETH (THORChain/Maya or the TSD route), then Relay ETH -> HYPE.
 * from_hype: Relay HYPE -> ETH, then ETH -> coin/TSD (THORChain/Maya or the TSD route).
 * Every hop pays the member's own pocket. The second hop hands on only the ETH that arrived
 * (never coins the member already held) less its own network fee, and only when a fresh price
 * still clears the agreed minimum; otherwise Seeds stops and the ETH stays in the pocket (kept_mid).
 */
/** to_ton_usdt: coin/TSD -> ETH -> TON (Relay) -> USD₮ on TON (STON.fi), three steps, one tap. */
export type HypeChainDirection = "to_hype" | "from_hype" | "to_ton" | "to_ton_usdt";
/** Directions whose Relay step comes second (coin -> ETH -> HYPE/TON). */
export const relayIsSecond = (d: HypeChainDirection) => d !== "from_hype";
/** The coin a Relay-ending chain delivers. */
export const chainEndSymbol = (d: HypeChainDirection) => (d === "to_ton" ? "TON" : d === "to_ton_usdt" ? "USD₮ on TON" : "HYPE");
/** Chains with a third step: TON -> USD₮ on TON on STON.fi. */
export const hasTonStep = (d: HypeChainDirection) => d === "to_ton_usdt";
/** The Relay direction used for this chain's Relay step. */
export const relayLegDirection = (d: HypeChainDirection): "to_hype" | "from_hype" | "to_ton" => (d === "to_ton_usdt" ? "to_ton" : d);
export type HypeChainVia = "tsd" | "xchain";
export type HypeChainStatus =
  | "awaiting_approval" | "approved" | "leg1" | "mid" | "leg2" | "mid2" | "leg3"
  | "done" | "failed" | "kept_mid" | "declined" | "expired" | "cancelled";

export const HYPE_CHAIN_TERMINAL: readonly HypeChainStatus[] = ["done", "failed", "kept_mid", "declined", "expired", "cancelled"];
export const isHypeChainTerminal = (s: string) => (HYPE_CHAIN_TERMINAL as readonly string[]).includes(s);
/** Chained HYPE swaps are for beta testers first (Relay is). */
export const HYPE_CHAIN_TESTERS_ONLY = true;
/** A hop still waiting after this long gets a note for the team; nothing is re-sent. */
export const HOP_STUCK_MINUTES = 120;

export const HYPE_CHAIN_LABEL: Record<HypeChainStatus, string> = {
  awaiting_approval: "Waiting for your Telegram tap", approved: "Starting", leg1: "Step 1", mid: "Starting step 2", leg2: "Step 2", mid2: "Starting step 3", leg3: "Step 3",
  done: "Delivered", failed: "Stopped", kept_mid: "Stopped — ETH in your pocket", declined: "Declined", expired: "Not approved in time", cancelled: "Cancelled",
};

/** How the non-HYPE side reaches ETH: TSD uses the TSD route; any other coin uses THORChain/Maya. ETH itself is a plain Relay swap. */
export function hopFor(side: { kind: "tsd" } | { kind: "coin"; id: string }): HypeChainVia | null {
  if (side.kind === "tsd") return "tsd";
  if (side.id === "ETH") return null;
  return "xchain";
}

/**
 * ETH (wei) handed to the second hop: what the first hop reported, never more than arrived in
 * the pocket since just before step 1, less the second hop's network fee. null = nothing to hand on.
 */
export function ethToHandOn(reportedWei: bigint | null, balanceWei: bigint | null, baselineWei: bigint | null, feeWei: bigint): bigint | null {
  if (reportedWei == null || reportedWei <= 0n || balanceWei == null || baselineWei == null) return null;
  const arrived = balanceWei - baselineWei;
  if (arrived <= 0n) return null;
  const base = reportedWei < arrived ? reportedWei : arrived;
  const out = base - feeWei;
  return out > 0n ? out : null;
}

/** The second hop may go: a fresh price for what arrived clears the agreed minimum. */
export function secondHopOk(freshOut: number, agreedMin: number): boolean {
  return Number.isFinite(freshOut) && Number.isFinite(agreedMin) && agreedMin > 0 && freshOut >= agreedMin;
}

/** Agreed minimum from the shown result and the member's price protection. */
export function chainMinimum(shownOut: number, slippageBps: number): number {
  return shownOut * (10_000 - slippageBps) / 10_000;
}

/** Steps shown in My swaps. */
export function chainSteps(d: HypeChainDirection, via: HypeChainVia, symbol: string): string[] {
  const hop = via === "tsd" ? "TSD Bridge" : "THORChain/Maya";
  if (hasTonStep(d)) return ["Telegram tap", `${hop}: ${symbol} → ETH`, "Relay: ETH → TON", "STON.fi: TON → USD₮ on TON"];
  return relayIsSecond(d)
    ? ["Telegram tap", `${hop}: ${symbol} → ETH`, `Relay: ETH → ${chainEndSymbol(d)}`]
    : ["Telegram tap", "Relay: HYPE → ETH", `${hop}: ETH → ${symbol}`];
}

/** TON kept back from what arrived for the STON.fi step: its forward gas, the jetton-wallet keep and a send-fee margin (nanotons). */
export const TON_STEP_RESERVE_NANO = 185_000_000n + 30_000_000n + 50_000_000n;
/** STON.fi step needs at least this much TON to hand on (0.1 TON, the swap form's minimum). */
export const TON_STEP_MIN_NANO = 100_000_000n;

/**
 * TON (nanotons) handed to the STON.fi step: what Relay reported, never more than arrived in the
 * TON pocket since just before the Relay step, less the step's TON reserve; null below the minimum.
 */
export function tonToHandOn(reportedNano: bigint | null, balanceNano: bigint | null, baselineNano: bigint | null): bigint | null {
  const out = ethToHandOn(reportedNano, balanceNano, baselineNano, TON_STEP_RESERVE_NANO);
  return out != null && out >= TON_STEP_MIN_NANO ? out : null;
}
