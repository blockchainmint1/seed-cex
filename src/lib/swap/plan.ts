/**
 * One swap form for every coin (pure, client-safe, tested).
 *
 * A side of a swap is TSD, a THORChain/Maya coin, or any token on a pool network
 * (Ethereum, Base, BNB Chain, PulseChain). planSwap names every way Seeds can do
 * the pair; the page quotes each and the best output wins. When no single route
 * reaches, a two-step swap joins one pool hop and one THORChain/Maya hop through
 * a plain coin both sides share (Ether, BNB, USDC, USDT).
 */
import { SWAP_COINS, swapCoin, type Protocol, type SwapCoin, type SwapCoinId } from "@/lib/xchain/assets";
import { receivePocket, sendSource } from "@/lib/xchain/send-rules";
import { routeCoinProblem } from "@/lib/xchain/tsd-route";
import { DEX_NETWORKS, NATIVE, sameAddr, type DexNetwork } from "@/lib/dex/venues";
import { BRIDGE_USDC_ETH, TSD_DEX, isTsdDex } from "@/lib/dex/swap-rules";

export type SwapSide =
  | { kind: "tsd" }
  | { kind: "coin"; id: SwapCoinId }
  | { kind: "token"; network: DexNetwork; address: string; symbol: string; name?: string }
  /** HYPE on Hyperliquid's HyperEVM, swapped with Ether through Relay. */
  | { kind: "hype" };

export type TwoStepDirection = "dex_then_x" | "x_then_dex";

export type RouteOption =
  | { kind: "xchain"; from: SwapCoinId; to: SwapCoinId }
  | { kind: "tsd"; direction: "buy" | "sell"; coin: SwapCoinId }
  | { kind: "dex"; network: DexNetwork; tokenIn: string; tokenOut: string }
  | { kind: "two"; direction: TwoStepDirection; network: DexNetwork; token: string; coin: SwapCoinId; mids: SwapCoinId[] }
  | { kind: "relay"; direction: "to_hype" | "from_hype" }
  /** Any coin or TSD <-> HYPE in one tap: THORChain/Maya or the TSD route to ETH, then Relay (src/lib/hype-chain). */
  | { kind: "hype_chain"; direction: "to_hype" | "from_hype"; via: "tsd" | "xchain"; coin: string };

export type SwapPlan = { options: RouteOption[]; problem: string | null };

/** THORChain chain code → pool network. */
const CHAIN_NET: Record<string, DexNetwork> = { ETH: "ethereum", BSC: "bsc", BASE: "base" };

/** Plain coins a two-step swap may pass through (natives and dollar coins only). */
export const MID_IDS: readonly SwapCoinId[] = ["ETH", "USDC", "USDT", "ETH.BASE", "USDC.BASE", "BNB", "USDC.BSC", "USDT.BSC"];

/** The same coin as a pool token, when it has one (ETH → Ethereum native, USDC.BASE → Base USDC contract). */
export function dexTwin(c: SwapCoin): { network: DexNetwork; address: string } | null {
  const network = CHAIN_NET[c.chain];
  if (!network) return null;
  if (!c.token) return { network, address: NATIVE };
  const contract = c.asset.split("-")[1];
  if (!contract || !/^0x[0-9a-f]{40}$/i.test(contract)) return null;
  return { network, address: `0x${contract.slice(2).toLowerCase()}` };
}

/** The THORChain/Maya coin behind a pool token, if THORChain or Maya lists it. */
export function coinForToken(network: DexNetwork, address: string): SwapCoin | null {
  return SWAP_COINS.find((c) => {
    const t = dexTwin(c);
    return t !== null && t.network === network && sameAddr(t.address, address);
  }) ?? null;
}

/** One name per coin: a listed token becomes its coin, Ethereum's TSD stand-in becomes TSD. */
export function normalizeSide(s: SwapSide): SwapSide {
  if (s.kind !== "token") return s;
  if (s.network === "ethereum" && isTsdDex(s.address)) return { kind: "tsd" };
  const c = coinForToken(s.network, s.address);
  return c ? { kind: "coin", id: c.id } : s;
}

export function sameSide(a: SwapSide, b: SwapSide): boolean {
  const x = normalizeSide(a), y = normalizeSide(b);
  if (x.kind !== y.kind) return false;
  if (x.kind === "tsd" || x.kind === "hype") return true;
  if (x.kind === "coin" && y.kind === "coin") return x.id === y.id;
  if (x.kind === "token" && y.kind === "token") return x.network === y.network && sameAddr(x.address, y.address);
  return false;
}

/** Where a side lives as a pool token, if anywhere. */
function asToken(s: SwapSide): { network: DexNetwork; address: string } | null {
  if (s.kind === "token") return { network: s.network, address: s.address };
  if (s.kind === "coin") {
    const c = swapCoin(s.id);
    return c ? dexTwin(c) : null;
  }
  return null;
}

const canSend = (c: SwapCoin, p?: Protocol) => (p ? sendSource(c, p) !== null : sendSource(c, "thorchain") !== null || sendSource(c, "maya") !== null);
const shared = (a: SwapCoin, b: SwapCoin) => a.protocols.filter((p) => b.protocols.includes(p));

/** Coins a two-step swap can pass through on `network` for this direction and coin. */
export function twoStepMids(direction: TwoStepDirection, network: DexNetwork, coin: SwapCoin): SwapCoinId[] {
  return MID_IDS.map((id) => swapCoin(id)).filter((m): m is SwapCoin => {
    if (!m || m.id === coin.id) return false;
    const t = dexTwin(m);
    if (!t || t.network !== network) return false;
    if (direction === "dex_then_x") return shared(m, coin).some((p) => canSend(m, p));
    return receivePocket(m) === "EVM" && shared(coin, m).some((p) => canSend(coin, p));
  }).map((m) => m.id);
}

/** THORChain/Maya networks a two-step hop may use (the coin that is sent must be sendable there). */
export function twoStepProtocols(direction: TwoStepDirection, coin: SwapCoin, mid: SwapCoin): Protocol[] {
  const sender = direction === "dex_then_x" ? mid : coin;
  return shared(coin, mid).filter((p) => canSend(sender, p));
}

const netName = (n: DexNetwork) => DEX_NETWORKS[n].name;

/** Every way Seeds can swap `from` for `to`, or why it can't. */
export function planSwap(fromIn: SwapSide, toIn: SwapSide): SwapPlan {
  const from = normalizeSide(fromIn), to = normalizeSide(toIn);
  const none = (problem: string): SwapPlan => ({ options: [], problem });
  if (sameSide(from, to)) return none("Pick two different coins.");

  // HYPE: Relay, with Ether on Ethereum on the other side (same pocket address on both networks).
  if (from.kind === "hype" || to.kind === "hype") {
    const other = from.kind === "hype" ? to : from;
    const direction = from.kind === "hype" ? ("from_hype" as const) : ("to_hype" as const);
    if (other.kind === "coin" && other.id === "ETH") return { options: [{ kind: "relay", direction }], problem: null };
    if (other.kind === "tsd") return { options: [{ kind: "hype_chain", direction, via: "tsd", coin: "TSD" }], problem: null };
    if (other.kind === "coin") {
      const c = swapCoin(other.id), e = swapCoin("ETH");
      const reach = c && e && c.protocols.some((p) => e.protocols.includes(p) && (direction === "to_hype" ? sendSource(c, p) !== null : sendSource(e, p) !== null && receivePocket(c) !== null));
      if (reach) return { options: [{ kind: "hype_chain", direction, via: "xchain", coin: c.id }], problem: null };
    }
    return none("This coin can't reach HYPE yet. HYPE swaps go through ETH on Ethereum; swap this coin to a THORChain coin first.");
  }

  // TSD on one side: TSD Bridge first (or last), then THORChain/Maya or an Ethereum pool.
  if (from.kind === "tsd" || to.kind === "tsd") {
    const direction = from.kind === "tsd" ? ("buy" as const) : ("sell" as const);
    const other = direction === "buy" ? to : from;
    const options: RouteOption[] = [];
    if (other.kind === "coin") {
      const c = swapCoin(other.id);
      if (c && !routeCoinProblem(direction, c)) options.push({ kind: "tsd", direction, coin: c.id });
    }
    const t = asToken(other);
    if (t && t.network === "ethereum" && !sameAddr(t.address, BRIDGE_USDC_ETH)) {
      options.push(direction === "buy"
        ? { kind: "dex", network: "ethereum", tokenIn: TSD_DEX, tokenOut: t.address }
        : { kind: "dex", network: "ethereum", tokenIn: t.address, tokenOut: TSD_DEX });
    }
    if (options.length) return { options, problem: null };
    if (t && t.network !== "ethereum") {
      return none(`TSD swaps reach THORChain coins and coins on Ethereum. For a coin on ${netName(t.network)}, swap TSD to ${DEX_NETWORKS[t.network].nativeSymbol} or USDC on ${netName(t.network)} first.`);
    }
    return none("TSD can't be swapped for that coin yet.");
  }

  const a = from.kind === "coin" ? swapCoin(from.id) : null;
  const b = to.kind === "coin" ? swapCoin(to.id) : null;
  const ta = asToken(from), tb = asToken(to);
  const options: RouteOption[] = [];
  if (a && b) options.push({ kind: "xchain", from: a.id, to: b.id });
  if (ta && tb && ta.network === tb.network) options.push({ kind: "dex", network: ta.network, tokenIn: ta.address, tokenOut: tb.address });
  if (options.length) return { options, problem: null };

  // Token → coin elsewhere: pool hop on the token's network, then THORChain/Maya from Ethereum.
  if (from.kind === "token" && b) {
    if (from.network !== "ethereum") {
      return none(`Seeds sends into THORChain and Maya from Ethereum only, so a coin on ${netName(from.network)} can be swapped for other coins on ${netName(from.network)} for now.`);
    }
    const mids = twoStepMids("dex_then_x", from.network, b);
    if (!mids.length) return none(`No plain coin links ${from.symbol} and ${b.symbol} yet.`);
    if (!receivePocket(b)) return none(`Your trading pocket can't hold ${b.symbol} on ${b.network} yet.`);
    return { options: [{ kind: "two", direction: "dex_then_x", network: from.network, token: from.address, coin: b.id, mids }], problem: null };
  }

  // Coin → token elsewhere: THORChain/Maya into the pocket on the token's network, then a pool hop.
  if (a && to.kind === "token") {
    if (to.network === "pulsechain") return none("THORChain and Maya don't reach PulseChain, so PulseChain coins swap only with other PulseChain coins.");
    if (!canSend(a)) return none(`Seeds can't send ${a.symbol} on ${a.network} yet, so it can't be the first step of a two-step swap.`);
    const mids = twoStepMids("x_then_dex", to.network, a);
    if (!mids.length) return none(`No plain coin links ${a.symbol} and ${to.symbol} yet.`);
    return { options: [{ kind: "two", direction: "x_then_dex", network: to.network, token: to.address, coin: a.id, mids }], problem: null };
  }

  if (from.kind === "token" && to.kind === "token") {
    return none(`These coins are on different networks (${netName(from.network)} and ${netName(to.network)}). Swap to a coin THORChain carries first, then swap again.`);
  }
  return none("Seeds has no route for these two coins yet.");
}

/** The agreed minimum a two-step swap must deliver: what was shown, less the member's price protection. */
export function agreedMinimum(shownOut: number, slippageBps: number): number {
  if (!(shownOut > 0) || !Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000) return 0;
  return (shownOut * (10_000 - slippageBps)) / 10_000;
}

/** Best of several outputs (null = no quote); ties keep the earlier option. */
export function bestIndex(outs: Array<number | null | undefined>): number | null {
  let best: number | null = null;
  outs.forEach((o, i) => {
    if (o == null || !Number.isFinite(o) || o <= 0) return;
    if (best === null || o > (outs[best] as number)) best = i;
  });
  return best;
}

/** Floor to at most `d` decimals, as a plain decimal string (for amounts handed to the next hop). */
export function floorAmount(n: number, d: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  const f = 10 ** Math.min(d, 12);
  const v = Math.floor(n * f) / f;
  return v.toFixed(Math.min(d, 12)).replace(/\.?0+$/, "") || "0";
}
