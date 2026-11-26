/**
 * The Swap link on a Balances row: which pair to open the swap form on (pure, tested).
 *
 * A row's coin is turned into the side the swap form understands, then the pair is the
 * one Seeds can actually plan (src/lib/swap/plan.ts): sell what you hold back to TSD,
 * otherwise buy it with TSD. A link never opens a pair the form can't plan, and a row
 * with no route at all gets no pair (the page keeps its plain Swap link).
 *
 * USD₮ on TON has no direct route yet — it only arrives from TON on STON.fi — so its
 * link opens the form on TSD → USD₮ on TON and the page shows the one tap that starts
 * it (TSD → TON). Why: the link must land on the route the member meant, not an empty form.
 */
import { SWAP_COINS, swapCoin, type SwapCoinId } from "@/lib/xchain/assets";
import { coinForToken, planSwap, type SwapSide } from "@/lib/swap/plan";
import type { TokenChain } from "@/lib/account/erc-tokens";
import { ECOSYSTEM_TOKENS } from "@/lib/dex/ecosystem-tokens";

/** What the swap form's URL carries: a `from` and a `to`, both words it accepts. */
export type SwapPair = { from: string; to: string };

const TSD: SwapSide = { kind: "tsd" };

/** Every THORChain/Maya coin id, looked up once. */
const SWAP_IDS: SwapCoinId[] = SWAP_COINS.map((c) => c.id);

/** THORChain chain code → the Balances network id that holds that coin. */
const CHAIN_NET: Record<string, string> = {
  BTC: "btc",
  ETH: "ethereum",
  BASE: "base",
  BSC: "bsc",
  AVAX: "avalanche",
  LTC: "ltc",
  DOGE: "doge",
  BCH: "bch",
  XRP: "xrp",
  SOL: "sol",
  ZEC: "zec",
  TRON: "trx",
  ADA: "ada",
};

/** The sides the swap form knows that aren't THORChain/Maya coins, by "SYMBOL:network". */
const SPECIAL: Record<string, { side: SwapSide; token: string }> = {
  "TSD:txc-omni": { side: { kind: "tsd" }, token: "TSD" },
  "USDT:ton": { side: { kind: "ton_usdt" }, token: "USDT_TON" },
  "TON:ton": { side: { kind: "ton" }, token: "TON" },
  "HYPE:hyperevm": { side: { kind: "hype" }, token: "HYPE" },
};

/**
 * The swap side behind a Balances row (coin symbol + network id), or null when Seeds
 * has no swap side for that coin at all (TXC, ISK, ZCU, PulseChain coins, HEX, XMR…).
 */
export function sideFor(symbol: string, netId: string): { side: SwapSide; token: string } | null {
  const special = SPECIAL[`${symbol}:${netId}`];
  if (special) return special;
  const wrapped = netId === "ethereum" ? ECOSYSTEM_TOKENS.find((t) => t.symbol === symbol) : null;
  if (wrapped) return { side: { kind: "token", network: "ethereum", address: wrapped.address, symbol: wrapped.symbol, name: wrapped.name }, token: wrapped.symbol };
  for (const id of SWAP_IDS) {
    const coin = swapCoin(id);
    if (!coin || coin.symbol !== symbol) continue;
    if (CHAIN_NET[coin.chain] !== netId) continue;
    return { side: { kind: "coin", id }, token: id };
  }
  return null;
}

/**
 * The pair to open the swap form on for a side the member holds `held` of.
 * Selling what you hold comes first; otherwise the link offers buying it with TSD.
 */
export function swapPairFor(side: SwapSide, token: string, held: number): SwapPair | null {
  if (side.kind === "tsd") return null; // the TSD row has nothing to sell into TSD
  if (held > 0 && planSwap(side, TSD).options.length) return { from: token, to: "TSD" };
  // TON's only swap is into USD₮ on TON; it can't be sold for TSD yet.
  if (held > 0 && side.kind === "ton") return { from: "TON", to: "USDT_TON" };
  if (planSwap(TSD, side).options.length) return { from: "TSD", to: token };
  // USD₮ on TON is reachable only through TON: open the form on the pair the member meant.
  if (side.kind === "ton_usdt") return { from: "TSD", to: "USDT_TON" };
  return null;
}

/** The Swap-link pair for a Balances row, or null when no pair can be planned. */
export function swapPairForRow(symbol: string, netId: string, held: number): SwapPair | null {
  const s = sideFor(symbol, netId);
  return s ? swapPairFor(s.side, s.token, held) : null;
}

/** The Swap-link pair for an Ethereum/Base token row, or null when no pair can be planned. */
export function swapPairForToken(chain: TokenChain, contract: string, held: number): SwapPair | null {
  const c = coinForToken(chain, contract);
  return c ? swapPairFor({ kind: "coin", id: c.id }, c.id, held) : null;
}

/** The pair for a "swap it back to TSD" note: the coin's own route into TSD, when it has one. */
export function swapPairForCoinSymbol(symbol: string): SwapPair | null {
  for (const id of SWAP_IDS) {
    const coin = swapCoin(id);
    if (!coin || coin.symbol !== symbol) continue;
    const pair = swapPairFor({ kind: "coin", id }, id, 1);
    if (pair && pair.to === "TSD") return pair;
  }
  return null;
}
