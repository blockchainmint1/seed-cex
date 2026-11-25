/**
 * Several swaps at once (QA-0009, all swap types). A "lane" is one coin in one pocket.
 * Swaps that note a balance before coins arrive and hand on only what is new (chained,
 * two-step, Relay, STON.fi) are "balance-watching": no other open swap may touch the
 * same coin while they run, or one swap could take another's arriving coins. Swaps that
 * track their own exact amounts (TSD swaps, THORChain/Maya sends, pool swaps) may share
 * lanes with each other. Pure; tested in lanes.test.ts.
 */
export type SwapKind = "tsd" | "send" | "dex" | "two_step" | "relay" | "ston" | "hype_chain";
/** lanes = coins the swap holds or watches; passes = coins it only hands through by exact amount (block watching swaps only). */
export type OpenSwap = { kind: SwapKind; lanes: string[]; passes?: string[] };

/** Most top-level swaps one member may have open at the same time. */
export const MAX_OPEN_SWAPS = 5;
const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const WATCHING: ReadonlySet<SwapKind> = new Set(["two_step", "relay", "ston", "hype_chain"]);
const NET: Record<string, string> = { ethereum: "ETH", base: "BASE", bsc: "BSC" };

/** THORChain-style asset ("ETH.ETH", "ETH.USDC-0xA0b8…", "BTC.BTC") → lane; TSD has its own accounting → null. */
export function assetLane(asset: string | null | undefined): string | null {
  if (!asset) return null;
  const a = asset.trim();
  if (/^(TSD|TXC\.TSD|OMNI\.TSD)$/i.test(a)) return null;
  const m = /^([A-Za-z0-9]+)\.([^-]+)(?:-(0x[0-9a-fA-F]{40}))?$/.exec(a);
  if (!m) return `X:${a.toUpperCase()}`;
  const chain = m[1]!.toUpperCase();
  if (m[3]) return `${chain}:${m[3].toLowerCase()}`;
  return `${chain}:${m[2]!.toUpperCase()}`;
}

/** Pool-swap token on an EVM network → lane (native coin = the chain's own coin lane). */
export function tokenLane(network: string, token: string): string | null {
  const chain = NET[network] ?? network.toUpperCase();
  if (!token) return null;
  if (token.toLowerCase() === NATIVE) return chain === "BSC" ? "BSC:BNB" : `${chain}:ETH`;
  return `${chain}:${token.toLowerCase()}`;
}

export const ETH_LANE = "ETH:ETH";
export const TON_LANE = "TON:TON";
export const USDT_TON_LANE = "TON:USDT";
export const HYPE_LANE = "HYPER:HYPE";
/** Audit LN1: USDC on Ethereum passes through the member's EVM pocket on every TSD step (bridge pays it in / THORChain pays it out). */
export const TSD_USDC_LANE = "ETH:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
/** USDC a TSD step hands through the EVM pocket: a "pass", so it blocks only swaps that watch USDC. */
export const TSD_PASSES = [TSD_USDC_LANE];
/** A chained swap's step 1 may be a TSD swap, so it passes USDC until step 1 is over. */
export const hypeChainPasses = (status: string) => (CHAIN_AFTER_STEP1.has(status) ? [] : TSD_PASSES);
const CHAIN_AFTER_STEP1 = new Set(["mid", "leg2", "mid2", "leg3"]);

const uniq = (xs: Array<string | null | undefined>) => [...new Set(xs.filter((x): x is string => !!x))];

/** Chained swap: every coin on the route until it reaches its TON step; then only the TON coins. */
export function hypeChainLanes(direction: string, status: string, coinLane: string | null): string[] {
  const ton = direction === "to_ton" || direction === "to_ton_usdt";
  const endTon = direction === "to_ton_usdt" ? [TON_LANE, USDT_TON_LANE] : [TON_LANE];
  if (ton && (status === "mid2" || status === "leg3")) return endTon;
  return uniq([ETH_LANE, ...(ton ? endTon : [HYPE_LANE]), coinLane]);
}
export const relayLanes = (direction: string) => [ETH_LANE, direction === "to_ton" ? TON_LANE : HYPE_LANE];
export const stonLanes = () => [TON_LANE, USDT_TON_LANE];
export function twoStepLanes(network: string, token: string, coinLane: string | null, midLane: string | null): string[] {
  return uniq([tokenLane(network, token), coinLane, midLane, `POOL:${network}`]);
}
export function dexLanes(network: string, tokenIn: string, tokenOut: string): string[] {
  return uniq([tokenLane(network, tokenIn), tokenLane(network, tokenOut), `POOL:${network}`]);
}

/** Why `next` can't start next to the member's open swaps, or null. */
export function laneBlocker(next: OpenSwap, open: OpenSwap[]): string | null {
  if (open.length >= MAX_OPEN_SWAPS) return `You already have ${MAX_OPEN_SWAPS} swaps on their way. Wait for one to finish.`;
  for (const o of open) {
    if (!WATCHING.has(next.kind) && !WATCHING.has(o.kind)) continue;
    const shared = next.lanes.filter((l) => o.lanes.includes(l));
    // Audit LN1: a coin one swap only passes through still blocks a swap that watches that coin.
    if (WATCHING.has(o.kind)) shared.push(...(next.passes ?? []).filter((l) => o.lanes.includes(l)));
    if (WATCHING.has(next.kind)) shared.push(...(o.passes ?? []).filter((l) => next.lanes.includes(l)));
    if (shared.length) return `Another swap is still waiting on ${laneLabel(shared[0]!)} in your pocket. This one can start when that one finishes.`;
  }
  return null;
}

export function laneLabel(lane: string): string {
  if (lane === USDT_TON_LANE) return "USD₮ on TON";
  const [chain, coin] = lane.split(":");
  if (chain === "POOL") return `a pool swap on ${coin}`;
  if (coin?.startsWith("0x")) return `a token on ${chain}`;
  return coin === chain || !chain ? (coin ?? lane) : `${coin} (${chain})`;
}
