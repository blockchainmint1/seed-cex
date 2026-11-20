/**
 * Token swaps through Uniswap, PancakeSwap and PulseX from a member's own trading pocket.
 * Pure rules (no I/O), tested in swap-rules.test.ts. Client-safe.
 *
 * A swap always pays the member's own pocket (the same address it spends from), so a
 * swap can never be used to send coins somewhere else. Every swap still waits for the
 * member's Approve tap in Telegram, and the pool is given permission for exactly the
 * swap amount, never "unlimited".
 */
import {
  encApprove, encV2Swap, encV3ExactInput, encV3ExactInputSingle, encV3Multicall, encV3UnwrapWeth, v3Path, V3_ADDRESS_THIS,
} from "./abi";
import { DEX_NETWORKS, isNative, sameAddr, type DexNetwork, type Venue } from "./venues";

/** Pilot switch: until each network has had a small real-money test, only beta testers can swap. */
export const DEX_SWAP_TESTERS_ONLY = true;

/** How far below the shown price a member will accept, in basis points (100 = 1%). */
export const SLIPPAGE_CHOICES_BPS = [50, 100, 300, 1000] as const;
export const DEFAULT_SLIPPAGE_BPS = 100;
export const MAX_SLIPPAGE_BPS = 1000;
/** The server's own fresh quote may be at most this much below what the member was shown. */
export const DEX_REQUOTE_TOLERANCE_BPS = 100;
/** TSD swaps: the pool step runs after TSD Bridge pays (minutes later); allow this much drift before stopping. */
export const TSD_LEG_TOLERANCE_BPS = 200;
/** Swap deadline written into the transaction. */
export const DEADLINE_SECONDS = 10 * 60;
/** A recorded transaction the network still doesn't know after this long needs a person. */
export const LOST_TX_MINUTES = 20;

/* --------------------------- TSD as a coin on Ethereum --------------------------- */

/**
 * Stand-in "address" for TSD in the Ethereum coin list. Never sent to a chain: a TSD side
 * becomes a TSD Bridge step (TSD <-> Ethereum USDC, 1:1 less the bridge fee) plus a pool swap.
 */
export const TSD_DEX = "0x7e5d000000000000000000000000000000007e5d";
export const BRIDGE_USDC_ETH = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
export const isTsdDex = (a: string) => sameAddr(a, TSD_DEX);

/** Why this pair can't go through the TSD + pool route, or null. */
export function tsdPairProblem(network: DexNetwork, tokenIn: string, tokenOut: string): string | null {
  const tin = isTsdDex(tokenIn), tout = isTsdDex(tokenOut);
  if (!tin && !tout) return null;
  if (network !== "ethereum") return "TSD swaps run on Ethereum (TSD Bridge pays and takes Ethereum USDC).";
  if (tin && tout) return "Pick two different coins.";
  const other = tin ? tokenOut : tokenIn;
  if (sameAddr(other, BRIDGE_USDC_ETH)) return "TSD ↔ USDC is a straight TSD Bridge conversion: use the main Swap page.";
  return null;
}

/** USDC the bridge pays for `amount` (USD-pegged both sides), rounded down to 6 decimals. */
export function afterBridgeFeeUnits(units: bigint, feeBps: number): bigint {
  if (units <= 0n || !Number.isInteger(feeBps) || feeBps < 0 || feeBps >= 10_000) return 0n;
  return (units * BigInt(10_000 - feeBps)) / 10_000n;
}

/* ---------------------------------- amounts ---------------------------------- */

export function minOutUnits(quoted: bigint, slippageBps: number): bigint {
  if (quoted <= 0n || !Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > MAX_SLIPPAGE_BPS) return 0n;
  return (quoted * BigInt(10_000 - slippageBps)) / 10_000n;
}

/** The minimum written into the swap: the member's agreed floor, or tighter when the live price is better. */
export function sendMinOut(agreedMin: bigint, freshQuote: bigint, slippageBps: number): bigint {
  const live = minOutUnits(freshQuote, slippageBps);
  return live > agreedMin ? live : agreedMin;
}

/** The fresh quote may be at most `toleranceBps` below the reference. */
export function requoteUnitsOk(reference: bigint, fresh: bigint, toleranceBps: number = DEX_REQUOTE_TOLERANCE_BPS): boolean {
  if (reference <= 0n || fresh <= 0n) return false;
  return fresh * 10_000n >= reference * BigInt(10_000 - toleranceBps);
}

/** Scale a shown output to the amount that actually arrived (TSD Bridge pays slightly different amounts). */
export function scaledReference(shownOut: bigint, shownIn: bigint, actualIn: bigint): bigint {
  if (shownIn <= 0n) return 0n;
  return (shownOut * actualIn) / shownIn;
}

/* ------------------------------------ gas ------------------------------------ */

export const GAS = { approve: 70_000n, reset: 50_000n, v2: 260_000n, v3: 300_000n, extraHop: 90_000n } as const;
/** Fee coin headroom: fees can rise between check and send (Base also adds a small Ethereum data fee). */
const HEADROOM_PCT: Record<DexNetwork, bigint> = { ethereum: 130n, base: 150n, bsc: 130n, pulsechain: 130n };

export function swapGasUnits(kind: "v2" | "v3", hops: number, needsApproval: boolean): bigint {
  const swap = (kind === "v2" ? GAS.v2 : GAS.v3) + GAS.extraHop * BigInt(Math.max(0, hops - 1));
  return swap + (needsApproval ? GAS.approve : 0n);
}

export function feeNeedWei(net: DexNetwork, units: bigint, maxFeePerGas: bigint): bigint {
  return (units * maxFeePerGas * HEADROOM_PCT[net]) / 100n;
}

/** Lowest tip Seeds will offer per network (some nodes suggest ~0, which can leave a swap waiting). */
export const MIN_TIP_WEI: Record<DexNetwork, bigint> = {
  ethereum: 50_000_000n, // 0.05 gwei
  base: 1_000_000n, // 0.001 gwei
  bsc: 50_000_000n, // 0.05 gwei
  pulsechain: 0n,
};

/** EIP-1559 fees with the tip floored, and never below the node's legacy gas price. */
export function settleFees(net: DexNetwork, s: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }, gasPrice: bigint | null) {
  let tip = s.maxPriorityFeePerGas < MIN_TIP_WEI[net] ? MIN_TIP_WEI[net] : s.maxPriorityFeePerGas;
  let max = s.maxFeePerGas + (tip - s.maxPriorityFeePerGas);
  if (gasPrice != null && max < gasPrice) max = gasPrice;
  if (tip > max) tip = max;
  return { maxFeePerGas: max, maxPriorityFeePerGas: tip };
}

/** Plain-English shortfall, or null when the pocket can pay. */
export function feeProblem(net: DexNetwork, i: { needWei: bigint; haveWei: bigint; valueWei: bigint }): string | null {
  const need = i.needWei + i.valueWei;
  if (i.haveWei >= need) return null;
  const sym = DEX_NETWORKS[net].nativeSymbol;
  const short = Number(need - i.haveWei) / 1e18;
  return i.valueWei > 0n
    ? `Not enough ${sym}: the swap plus the ${DEX_NETWORKS[net].name} network fee needs about ${fmtCoin(short)} ${sym} more. Nothing was sent.`
    : `Your pocket needs about ${fmtCoin(short)} ${sym} more on ${DEX_NETWORKS[net].name} to pay the network fee. Nothing was sent.`;
}

const fmtCoin = (n: number) => (n >= 1 ? n.toFixed(4) : n.toPrecision(3)).replace(/0+$/, "").replace(/\.$/, "");

/* ------------------------------- transactions -------------------------------- */

export type SwapTerms = {
  network: DexNetwork;
  venue: Pick<Venue, "kind" | "router">;
  tokenIn: string;
  tokenOut: string;
  /** Pool tokens (wrapped coin in place of the native one). */
  path: string[];
  fees: number[];
  amountIn: bigint;
  minOut: bigint;
  recipient: string;
  deadline: number;
};

/** The one router call for a swap: target, calldata, and the native coin it carries. */
export function buildSwapCall(t: SwapTerms): { to: string; data: string; value: bigint } {
  if (t.minOut <= 0n) throw new Error("A swap needs a minimum above zero.");
  if (t.path.length < 2) throw new Error("No route.");
  const nativeIn = isNative(t.tokenIn);
  const nativeOut = isNative(t.tokenOut);
  const wrapped = DEX_NETWORKS[t.network].wrapped;
  if (nativeIn && !sameAddr(t.path[0], wrapped)) throw new Error("Route doesn't start at the wrapped coin.");
  if (nativeOut && !sameAddr(t.path[t.path.length - 1], wrapped)) throw new Error("Route doesn't end at the wrapped coin.");
  if (!nativeIn && !sameAddr(t.path[0], t.tokenIn)) throw new Error("Route doesn't start at the coin you send.");
  if (!nativeOut && !sameAddr(t.path[t.path.length - 1], t.tokenOut)) throw new Error("Route doesn't end at the coin you get.");
  const value = nativeIn ? t.amountIn : 0n;

  if (t.venue.kind === "v2") {
    return {
      to: t.venue.router,
      value,
      data: encV2Swap({ nativeIn, nativeOut, amountIn: t.amountIn, minOut: t.minOut, path: t.path, to: t.recipient, deadline: t.deadline }),
    };
  }
  if (t.fees.length !== t.path.length - 1) throw new Error("Route fee tiers don't match its steps.");
  // Native out: the router keeps the wrapped coin, then unwraps it straight to the member.
  const swapTo = nativeOut ? V3_ADDRESS_THIS : t.recipient;
  const swap = t.path.length === 2
    ? encV3ExactInputSingle({ tokenIn: t.path[0], tokenOut: t.path[1], fee: t.fees[0], recipient: swapTo, amountIn: t.amountIn, minOut: t.minOut })
    : encV3ExactInput({ path: v3Path(t.path, t.fees), recipient: swapTo, amountIn: t.amountIn, minOut: t.minOut });
  const calls = nativeOut ? [swap, encV3UnwrapWeth(t.minOut, t.recipient)] : [swap];
  return { to: t.venue.router, value, data: encV3Multicall(t.deadline, calls) };
}

/** Approval steps for exactly `amount`: none when the allowance covers it; a reset to 0 first when one is already set (USDT refuses changes). */
export function approvalSteps(token: string, spender: string, allowance: bigint, amount: bigint): Array<{ to: string; data: string; reset: boolean }> {
  if (allowance >= amount) return [];
  const out: Array<{ to: string; data: string; reset: boolean }> = [];
  if (allowance > 0n) out.push({ to: token, data: encApprove(spender, 0n), reset: true });
  out.push({ to: token, data: encApprove(spender, amount), reset: false });
  return out;
}

/* ------------------------------ receipt reading ------------------------------ */

export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const WITHDRAWAL_TOPIC = "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65";
type Log = { address: string; topics: string[]; data: string };
const topicAddr = (t: string | undefined) => (t ? `0x${t.slice(-40)}`.toLowerCase() : "");

/**
 * What actually arrived, read from the swap's receipt: Transfer events of the coin into
 * the member's pocket, or (native coin) the wrapped coin unwrapped by the router.
 */
export function receivedFromLogs(logs: Log[], i: { network: DexNetwork; tokenOut: string; recipient: string; router: string }): bigint {
  let sum = 0n;
  if (isNative(i.tokenOut)) {
    const w = DEX_NETWORKS[i.network].wrapped;
    for (const l of logs) {
      if (sameAddr(l.address, w) && l.topics[0] === WITHDRAWAL_TOPIC && topicAddr(l.topics[1]) === i.router.toLowerCase()) sum += BigInt(l.data);
    }
    return sum;
  }
  for (const l of logs) {
    if (sameAddr(l.address, i.tokenOut) && l.topics[0] === TRANSFER_TOPIC && topicAddr(l.topics[2]) === i.recipient.toLowerCase()) sum += BigInt(l.data.slice(0, 66));
  }
  return sum;
}

/* ------------------------------- status & gates ------------------------------- */

export type DexStatus =
  | "awaiting_approval" | "approved" | "bridging" | "ready" | "approving" | "swapping" | "minting"
  | "done" | "failed" | "declined" | "expired" | "cancelled" | "kept_usdc";

export const DEX_TERMINAL: DexStatus[] = ["done", "failed", "declined", "expired", "cancelled", "kept_usdc"];
export const isDexTerminal = (s: string) => (DEX_TERMINAL as string[]).includes(s);

export const DEX_STATUS_LABEL: Record<DexStatus, string> = {
  awaiting_approval: "Waiting for your Telegram tap",
  approved: "Approved — starting",
  bridging: "TSD Bridge converting",
  ready: "Preparing the swap",
  approving: "Giving the pool permission",
  swapping: "Swapping",
  minting: "TSD Bridge issuing TSD",
  done: "Delivered",
  failed: "Stopped",
  declined: "Declined",
  expired: "Not approved in time",
  cancelled: "Cancelled",
  kept_usdc: "Stopped — USDC in your pocket",
};

/** Steps the member sees, in order. */
export function dexSteps(tsdSide: "buy" | "sell" | null, venue: string, outSymbol: string): string[] {
  if (tsdSide === "buy") return ["Approved in Telegram", "TSD Bridge pays USDC", `${venue} swaps`, `${outSymbol} in your pocket`];
  if (tsdSide === "sell") return ["Approved in Telegram", `${venue} swaps to USDC`, "TSD Bridge issues TSD", "TSD in your pocket"];
  return ["Approved in Telegram", "Pool permission", `${venue} swaps`, `${outSymbol} in your pocket`];
}

/** Index of the step in progress (all done = steps.length). */
export function dexStepIndex(tsdSide: "buy" | "sell" | null, status: string): number {
  if (status === "done") return 4;
  if (status === "awaiting_approval") return 0;
  if (tsdSide === "buy") return status === "approved" || status === "bridging" ? 1 : 2;
  if (tsdSide === "sell") return status === "minting" ? 2 : 1;
  return status === "approved" || status === "ready" || status === "approving" ? 1 : 2;
}

export type DexLinkLike = { mode: string; hasKey: boolean; pockets: string[] } | null;

/** First reason this member can't start a token swap now, or null. */
export function dexSwapBlocker(i: {
  tester: boolean;
  link: DexLinkLike;
  tsdSide: "buy" | "sell" | null;
  telegramVerified: boolean;
}): string | null {
  if (DEX_SWAP_TESTERS_ONLY && !i.tester) return "Token swaps are open to beta testers first. They open to members after that.";
  if (!i.link) return "Link your HME Wallet trading pocket first (Account → Security).";
  if (i.link.mode !== "access" || !i.link.hasKey) return "Your pocket is linked in approve-every-trade mode. Swaps need instant access for now.";
  if (!i.link.pockets.includes("EVM")) return "Your linked pocket doesn't include an Ethereum-type pocket. Use \"Add new coins\" on Account → Security.";
  if (i.tsdSide && !i.link.pockets.includes("TXC")) return "Your linked pocket doesn't include TEXITcoin, where TSD lives.";
  if (!i.telegramVerified) return "Connect Telegram (Account → Alerts). Every swap from your pocket waits for your Approve tap in Telegram.";
  return null;
}
