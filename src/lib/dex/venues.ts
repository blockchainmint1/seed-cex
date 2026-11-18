/**
 * Single-network trading pools Seeds quotes directly: Uniswap (Ethereum, Base),
 * PancakeSwap (BNB Chain) and PulseX (PulseChain). Client-safe, no I/O.
 *
 * Every address below was checked on-chain on 2026-11-18: the contract exists,
 * its factory()/WETH9()/WETH()/WPLS() answer matches the network's own wrapped
 * coin, and its bytecode contains the exact function selectors Seeds calls.
 */

export type DexNetwork = "ethereum" | "base" | "bsc" | "pulsechain";
export const DEX_NETWORK_IDS: readonly DexNetwork[] = ["ethereum", "base", "bsc", "pulsechain"];

export type VenueKind = "v2" | "v3";

export type Venue = {
  id: string;
  /** What members see, e.g. "Uniswap v3". */
  name: string;
  /** DexScreener's dexId + labels for this venue. */
  dexId: "uniswap" | "pancakeswap" | "pulsex";
  label: string;
  kind: VenueKind;
  /** v2: the classic router (quotes via getAmountsOut, sends via *SupportingFeeOnTransferTokens). v3: SwapRouter02-style router. */
  router: string;
  /** v3 only: QuoterV2. */
  quoter?: string;
  /** v3 only: pool fee tiers in hundredths of a basis point (500 = 0.05%). */
  fees?: readonly number[];
};

export type DexNetworkDef = {
  id: DexNetwork;
  name: string;
  nativeSymbol: string;
  /** The network's wrapped native coin (WETH / WBNB / WPLS). */
  wrapped: string;
  /** Extra coins tried as a middle step for two-hop routes. */
  hubs: readonly string[];
  venues: readonly Venue[];
  explorerTx: string;
};

/** Stand-in "address" for the network's own coin (ETH, BNB, PLS). */
export const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

/** Multicall3 — same address on all four networks (checked on Ethereum and PulseChain bytecode). */
export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

const UNI_FEES = [100, 500, 3000, 10000] as const;
const CAKE_FEES = [100, 500, 2500, 10000] as const;

export const DEX_NETWORKS: Record<DexNetwork, DexNetworkDef> = {
  ethereum: {
    id: "ethereum",
    name: "Ethereum",
    nativeSymbol: "ETH",
    wrapped: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    hubs: ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"], // USDC
    explorerTx: "https://etherscan.io/tx/",
    venues: [
      { id: "uniswap-v3-eth", name: "Uniswap v3", dexId: "uniswap", label: "v3", kind: "v3",
        router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e", fees: UNI_FEES },
      { id: "uniswap-v2-eth", name: "Uniswap v2", dexId: "uniswap", label: "v2", kind: "v2",
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" },
    ],
  },
  base: {
    id: "base",
    name: "Base",
    nativeSymbol: "ETH",
    wrapped: "0x4200000000000000000000000000000000000006",
    hubs: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"], // USDC
    explorerTx: "https://basescan.org/tx/",
    venues: [
      { id: "uniswap-v3-base", name: "Uniswap v3", dexId: "uniswap", label: "v3", kind: "v3",
        router: "0x2626664c2603336E57B271c5C0b26F421741e481", quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a", fees: UNI_FEES },
      { id: "uniswap-v2-base", name: "Uniswap v2", dexId: "uniswap", label: "v2", kind: "v2",
        router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24" },
    ],
  },
  bsc: {
    id: "bsc",
    name: "BNB Chain",
    nativeSymbol: "BNB",
    wrapped: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    hubs: ["0x55d398326f99059fF775485246999027B3197955"], // USDT (BSC-USD)
    explorerTx: "https://bscscan.com/tx/",
    venues: [
      { id: "pancake-v3-bsc", name: "PancakeSwap v3", dexId: "pancakeswap", label: "v3", kind: "v3",
        router: "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4", quoter: "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997", fees: CAKE_FEES },
      { id: "pancake-v2-bsc", name: "PancakeSwap v2", dexId: "pancakeswap", label: "v2", kind: "v2",
        router: "0x10ED43C718714eb63d5aA57B78B54704E256024E" },
    ],
  },
  pulsechain: {
    id: "pulsechain",
    name: "PulseChain",
    nativeSymbol: "PLS",
    wrapped: "0xA1077a294dDE1B09bB078844df40758a5D0f9a27",
    hubs: [],
    explorerTx: "https://scan.pulsechain.com/tx/",
    venues: [
      { id: "pulsex-v2", name: "PulseX v2", dexId: "pulsex", label: "v2", kind: "v2",
        router: "0x165C3410fC91EF562C50559f7d2289fEbed552d9" },
      { id: "pulsex-v1", name: "PulseX v1", dexId: "pulsex", label: "v1", kind: "v2",
        router: "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02" },
    ],
  },
};

export function isDexNetwork(x: unknown): x is DexNetwork {
  return typeof x === "string" && (DEX_NETWORK_IDS as readonly string[]).includes(x);
}

export function isAddress(x: unknown): x is string {
  return typeof x === "string" && /^0x[0-9a-fA-F]{40}$/.test(x);
}

export const isNative = (a: string) => a.toLowerCase() === NATIVE;

/** The token a pool actually holds for this side (native coin → its wrapped version). */
export function poolToken(net: DexNetwork, a: string): string {
  return isNative(a) ? DEX_NETWORKS[net].wrapped : a;
}

export const sameAddr = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Candidate routes: direct, and through the wrapped coin or a hub stablecoin. Pure, deduped. */
export function candidatePaths(net: DexNetwork, tokenIn: string, tokenOut: string): string[][] {
  const a = poolToken(net, tokenIn);
  const b = poolToken(net, tokenOut);
  if (sameAddr(a, b)) return [];
  const def = DEX_NETWORKS[net];
  const out: string[][] = [[a, b]];
  for (const hub of [def.wrapped, ...def.hubs]) {
    if (sameAddr(hub, a) || sameAddr(hub, b)) continue;
    out.push([a, hub, b]);
  }
  return out;
}

/** Find a venue by id on a network. */
export function venueById(net: DexNetwork, id: string): Venue | null {
  return DEX_NETWORKS[net].venues.find((v) => v.id === id) ?? null;
}

/* ------------------------------ member warnings ------------------------------ */

export type TokenRisk = { level: "ok" | "caution" | "danger"; reasons: string[] };

/**
 * Plain-English warnings for a coin anyone could have listed. Members may still pick
 * it (their choice); this only makes the risk impossible to miss.
 */
export function tokenRisk(i: {
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  ageDays: number | null;
  /** 1 − (what selling straight back would return ÷ what you put in). Null = couldn't check. */
  roundTripLoss: number | null;
  priceImpact: number | null;
}): TokenRisk {
  const reasons: string[] = [];
  let level: TokenRisk["level"] = "ok";
  const bump = (l: TokenRisk["level"]) => {
    if (l === "danger" || (l === "caution" && level === "ok")) level = l;
  };
  if (i.roundTripLoss === null) {
    reasons.push("Seeds couldn't confirm this coin can be sold back.");
    bump("danger");
  } else if (i.roundTripLoss > 0.25) {
    reasons.push(`Selling straight back would return ${Math.round((1 - i.roundTripLoss) * 100)}% of what you put in.`);
    bump("danger");
  } else if (i.roundTripLoss > 0.05) {
    reasons.push(`Selling straight back would lose about ${Math.round(i.roundTripLoss * 100)}%.`);
    bump("caution");
  }
  if (i.liquidityUsd === null || i.liquidityUsd < 10_000) {
    reasons.push("Very little money in its pools — prices can swing wildly.");
    bump("danger");
  } else if (i.liquidityUsd < 100_000) {
    reasons.push("Thin pools — larger swaps move the price.");
    bump("caution");
  }
  if (i.ageDays !== null && i.ageDays < 7) {
    reasons.push("Listed less than a week ago.");
    bump("caution");
  }
  if (i.volume24hUsd !== null && i.volume24hUsd < 1_000) {
    reasons.push("Almost no trading in the last 24 hours.");
    bump("caution");
  }
  if (i.priceImpact !== null && i.priceImpact > 0.05) {
    reasons.push(`This swap moves the price about ${Math.round(i.priceImpact * 100)}%.`);
    bump(i.priceImpact > 0.15 ? "danger" : "caution");
  }
  reasons.push("Anyone can list a coin on these pools. Seeds can't see hidden taxes or sell blocks inside a coin's code.");
  return { level, reasons };
}
