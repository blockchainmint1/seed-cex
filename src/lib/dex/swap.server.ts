/**
 * Token swaps through Uniswap, PancakeSwap and PulseX from a member's own trading pocket.
 *
 * Order is fixed and every step fails closed:
 *  1. request: server re-quotes from the pools (never trusts the browser), checks the price is
 *     at most 1% worse than shown, the coins and the network fee are in the pocket, then
 *     reserve_dex_swap (limits, one open swap per network) and a Telegram Approve request.
 *  2. Approve tap: the approval is spent once for exactly this swap; nothing moves before.
 *  3. TSD buys: TSD Bridge pays USDC into the member's own pocket first (an ordinary TSD route).
 *  4. Pool permission for exactly the swap amount (approve), stored before broadcast, then mined.
 *  5. Swap: fresh quote must still clear the agreed minimum, a test run (eth_call) must pass,
 *     the hash is stored before broadcast, and the swap pays only the pocket it came from.
 *  6. TSD sells: the USDC that actually arrived goes to TSD Bridge as an ordinary TSD route.
 * The every-minute job (/api/public/jobs/tsd-routes) and the Swap page both call advanceDexSwap.
 */
import { bytesToHex } from "@noble/hashes/utils.js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import type { ChainId } from "@/lib/chains";
import { encAllowance, encBalanceOf, decUint } from "./abi";
import { fromUnits, quoteExactRoute, quoteRoutes, toUnits, tokenInfo, type DexRoute, type TokenInfo } from "./quote.server";
import {
  afterBridgeFeeUnits, approvalSteps, BRIDGE_USDC_ETH, buildSwapCall, DEADLINE_SECONDS, dexSwapBlocker, DEX_REQUOTE_TOLERANCE_BPS, feeNeedWei,
  feeProblem, GAS, isDexTerminal, isTsdDex, LOST_TX_MINUTES, MAX_SLIPPAGE_BPS, minOutUnits, receivedFromLogs, requoteUnitsOk, scaledReference,
  sendMinOut, settleFees, swapGasUnits, TSD_DEX, TSD_LEG_TOLERANCE_BPS, tsdPairProblem, type DexStatus,
} from "./swap-rules";
import { DEX_NETWORKS, isNative, sameAddr, venueById, type DexNetwork } from "./venues";

type Row = Database["public"]["Tables"]["dex_swaps"]["Row"];

const USDC_DECIMALS = 6;
const GAS_USDC_TRANSFER = 80_000n;
const hex = (n: bigint) => `0x${n.toString(16)}`;
const round8 = (n: number) => Math.floor(n * 1e8) / 1e8;
const clean = (m: string) => m.replace(/^.*?ERROR:\s*/i, "").trim();
const minutesSince = (iso: string) => (Date.now() - Date.parse(iso)) / 60_000;
const chain = (n: DexNetwork) => n as ChainId;
const fmtNum = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 1 ? 6 : 10 });

/* ----------------------------------- reads ----------------------------------- */

async function rpc<T>(net: DexNetwork, method: string, params: unknown[]): Promise<T | null> {
  const { evmRpc } = await import("@/lib/evm.server");
  return evmRpc<T>(chain(net), method, params);
}

/** Native coin or token balance in base units; null when no server answered. */
async function balanceOf(net: DexNetwork, token: string, owner: string): Promise<bigint | null> {
  if (isNative(token)) {
    const h = await rpc<string>(net, "eth_getBalance", [owner, "latest"]);
    return h ? BigInt(h) : null;
  }
  const h = await rpc<string>(net, "eth_call", [{ to: token, data: encBalanceOf(owner) }, "latest"]);
  return h && h.length >= 66 ? decUint(h) : null;
}

async function allowanceOf(net: DexNetwork, token: string, owner: string, spender: string): Promise<bigint | null> {
  const h = await rpc<string>(net, "eth_call", [{ to: token, data: encAllowance(owner, spender) }, "latest"]);
  return h && h.length >= 66 ? decUint(h) : null;
}

async function networkFees(net: DexNetwork) {
  const { suggestFees } = await import("@/lib/evm.server");
  const [s, gp] = await Promise.all([suggestFees(chain(net)), rpc<string>(net, "eth_gasPrice", [])]);
  if (!s) return null;
  return settleFees(net, s, gp ? BigInt(gp) : null);
}

async function receipt(net: DexNetwork, hash: string) {
  return rpc<{ status: string; logs: Array<{ address: string; topics: string[]; data: string }> } | null>(net, "eth_getTransactionReceipt", [hash]);
}

function tsdInfo(): TokenInfo {
  return { address: TSD_DEX, symbol: "TSD", name: "TSD", decimals: 8 };
}

async function coinInfo(net: DexNetwork, a: string): Promise<TokenInfo | null> {
  return isTsdDex(a) ? tsdInfo() : tokenInfo(net, a);
}

/** The member's active link, only if it still holds the same pocket this swap uses. */
async function sameLink(userId: string, evm: string, txc?: string | null) {
  const { loadLink } = await import("@/lib/xchain/send.server");
  const link = await loadLink(userId);
  if (!link || !link.hasKey || link.mode !== "access") return null;
  if (!link.addresses.EVM || !sameAddr(link.addresses.EVM, evm)) return null;
  if (txc && link.addresses.TXC !== txc) return null;
  return link;
}

/* ----------------------------------- context ---------------------------------- */

/** What the Tokens page needs to offer a swap: no keys, no secrets. */
export async function dexSwapContext(userId: string, tester: boolean, network: DexNetwork, tokenIn: string) {
  const { loadLink } = await import("@/lib/xchain/send.server");
  const [link, prof] = await Promise.all([
    loadLink(userId),
    supabaseAdmin.from("profiles").select("telegram_verified").eq("id", userId).maybeSingle(),
  ]);
  const telegramVerified = prof.data?.telegram_verified === true;
  const tsdSide = isTsdDex(tokenIn) ? "buy" : null;
  const blocker = dexSwapBlocker({
    tester, tsdSide, telegramVerified,
    link: link ? { mode: link.mode, hasKey: link.hasKey, pockets: link.pockets as string[] } : null,
  });
  const evm = link?.addresses.EVM ?? null;
  let balanceIn: number | null = null;
  let nativeBalance: number | null = null;
  if (evm) {
    const nat = await balanceOf(network, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", evm).catch(() => null);
    nativeBalance = nat == null ? null : fromUnits(nat, 18);
    if (isTsdDex(tokenIn)) {
      if (link?.addresses.TXC) {
        const { freeTsdFor } = await import("@/lib/xchain/tsd-route.server");
        balanceIn = await freeTsdFor(userId, link.addresses.TXC).catch(() => null);
      }
    } else if (isNative(tokenIn)) {
      balanceIn = nativeBalance;
    } else {
      const [info, bal] = await Promise.all([tokenInfo(network, tokenIn), balanceOf(network, tokenIn, evm).catch(() => null)]);
      balanceIn = info && bal != null ? fromUnits(bal, info.decimals) : null;
    }
  }
  return {
    blocker, pocket: evm, telegramVerified, balanceIn, nativeBalance,
    nativeSymbol: DEX_NETWORKS[network].nativeSymbol,
  };
}

/** For two-step swaps (src/lib/two-step/): the same pocket reads this file uses. */
export { balanceOf as dexBalanceOf, networkFees as dexNetworkFees, coinInfo as dexCoinInfo };

/* ----------------------------------- request ---------------------------------- */

export type DexSwapRequest = {
  network: DexNetwork;
  tokenIn: string;
  tokenOut: string;
  amount: string;
  /** What the member was shown they'd get (coin, or TSD for a sell to TSD). */
  shownOut: number;
  slippageBps: number;
};

/** Audit C2: the free-coins check and the hold it leads to run one at a time per member. */
export async function requestDexSwap(userId: string, tester: boolean, input: DexSwapRequest) {
  const { withPocketSpendLock } = await import("@/lib/set-asides.server");
  return withPocketSpendLock(userId, () => requestDexSwapUnlocked(userId, tester, input));
}

async function requestDexSwapUnlocked(userId: string, tester: boolean, input: DexSwapRequest) {
  const net = input.network;
  if (sameAddr(input.tokenIn, input.tokenOut)) throw new Error("Pick two different coins.");
  const tsdProblem = tsdPairProblem(net, input.tokenIn, input.tokenOut);
  if (tsdProblem) throw new Error(tsdProblem);
  if (!Number.isInteger(input.slippageBps) || input.slippageBps < 10 || input.slippageBps > MAX_SLIPPAGE_BPS) throw new Error("Pick a price protection between 0.1% and 10%.");
  const tsdSide = isTsdDex(input.tokenIn) ? "buy" : isTsdDex(input.tokenOut) ? "sell" : null;

  const { loadLink } = await import("@/lib/xchain/send.server");
  const link = await loadLink(userId);
  const { data: prof } = await supabaseAdmin.from("profiles").select("telegram_verified").eq("id", userId).maybeSingle();
  const blocker = dexSwapBlocker({
    tester, tsdSide, telegramVerified: prof?.telegram_verified === true,
    link: link ? { mode: link.mode, hasKey: link.hasKey, pockets: link.pockets as string[] } : null,
  });
  if (blocker) throw new Error(blocker);
  const evm = link!.addresses.EVM!;
  const txc = tsdSide ? link!.addresses.TXC! : null;

  const [ia, ib] = await Promise.all([coinInfo(net, input.tokenIn), coinInfo(net, input.tokenOut)]);
  if (!ia || !ib) throw new Error(`That address isn't a coin on ${DEX_NETWORKS[net].name}.`);

  // The pool step: USDC -> coin (TSD buy), coin -> USDC (TSD sell), or coin -> coin.
  const legIn = tsdSide === "buy" ? BRIDGE_USDC_ETH : input.tokenIn;
  const legOut = tsdSide === "sell" ? BRIDGE_USDC_ETH : input.tokenOut;
  let bridge: { redeemFeeBps: number; mintFeeBps: number; minAmount: number; maxAmount: number } | null = null;
  if (tsdSide) {
    const { bridgeSettings, tsdBridgeConfigured } = await import("@/lib/xchain/tsd-bridge.server");
    if (!tsdBridgeConfigured()) throw new Error("TSD Bridge isn't connected.");
    const s = await bridgeSettings();
    if (!s.live) throw new Error("TSD Bridge is paused right now. Nothing was sent.");
    bridge = s;
  }

  const amountUnits = toUnits(input.amount, ia.decimals);
  const amountIn = round8(fromUnits(amountUnits, ia.decimals));
  if (!(amountIn > 0)) throw new Error("Enter an amount above zero (at most 8 decimal places count).");
  if (tsdSide === "buy" && amountIn < bridge!.minAmount) throw new Error(`TSD Bridge's minimum is ${bridge!.minAmount} TSD.`);
  if (tsdSide === "buy" && bridge!.maxAmount && amountIn > bridge!.maxAmount) throw new Error(`TSD Bridge's maximum is ${bridge!.maxAmount} TSD.`);
  const legInUnits = tsdSide === "buy"
    ? afterBridgeFeeUnits(toUnits(String(amountIn), USDC_DECIMALS), bridge!.redeemFeeBps)
    : toUnits(String(amountIn), ia.decimals);
  if (legInUnits <= 0n) throw new Error("Amount too small.");

  const routes = await quoteRoutes(net, legIn, legOut, legInUnits);
  const best = routes[0];
  if (!best) throw new Error(`No pool on ${DEX_NETWORKS[net].name} trades these two coins right now.`);
  const venue = venueById(net, best.venueId)!;

  // What the member ends up with, compared with what they were shown.
  let finalOut: number;
  if (tsdSide === "sell") {
    const usdcOut = fromUnits(best.amountOut, USDC_DECIMALS);
    if (usdcOut < bridge!.minAmount) throw new Error(`That's about ${usdcOut.toFixed(2)} USDC — under TSD Bridge's ${bridge!.minAmount} minimum.`);
    finalOut = fromUnits(afterBridgeFeeUnits(best.amountOut, bridge!.mintFeeBps), USDC_DECIMALS);
  } else {
    finalOut = fromUnits(best.amountOut, ib.decimals);
  }
  if (!(input.shownOut > 0) || finalOut < input.shownOut * (1 - DEX_REQUOTE_TOLERANCE_BPS / 10_000)) {
    throw new Error(`The price moved more than 1% since you looked (now about ${fmtNum(finalOut)} ${ib.symbol}). Check the new quote and try again.`);
  }

  // Dollar size for limits.
  let amountUsd: number | null = null;
  if (tsdSide === "buy") amountUsd = amountIn;
  else if (tsdSide === "sell") amountUsd = fromUnits(best.amountOut, USDC_DECIMALS);
  else {
    const { tokenMarket } = await import("./market.server");
    const m = await tokenMarket(net, input.tokenIn).catch(() => null);
    amountUsd = m?.priceUsd != null ? amountIn * m.priceUsd : null;
  }
  if (amountUsd == null && !tester) throw new Error("No live price for this coin, so the limit can't be checked.");

  // Coins and the network fee must already be in the pocket.
  if (tsdSide === "buy") {
    const { freeTsdFor } = await import("@/lib/xchain/tsd-route.server");
    const free = await freeTsdFor(userId, txc!);
    if (free == null) throw new Error("Couldn't read your TSD balance. Try again in a minute.");
    if (free < amountIn) throw new Error(`Your trading pocket has ${fmtNum(free)} TSD free to swap.`);
  } else {
    const bal = await balanceOf(net, legIn, evm);
    if (bal == null) throw new Error(`Couldn't read your pocket on ${DEX_NETWORKS[net].name}. Try again in a minute.`);
    if (bal < legInUnits) throw new Error(`Your pocket holds ${fmtNum(fromUnits(bal, ia.decimals))} ${ia.symbol} on ${DEX_NETWORKS[net].name}.`);
    // Coins set aside for open orders and trades stay put (set-asides.ts).
    const { legForEvmToken } = await import("@/lib/set-asides");
    const held = legForEvmToken(net, isNative(input.tokenIn) ? null : input.tokenIn);
    if (held) {
      const { pocketSpendProblem } = await import("@/lib/set-asides.server");
      const why = await pocketSpendProblem(userId, held, amountIn, { address: evm, network: net });
      if (why) throw new Error(why);
    }
  }
  const fees = await networkFees(net);
  if (!fees) throw new Error(`${DEX_NETWORKS[net].name} didn't answer. Try again in a minute.`);
  const allowance = isNative(legIn) ? legInUnits : ((await allowanceOf(net, legIn, evm, venue.router)) ?? 0n);
  const units = swapGasUnits(venue.kind, best.path.length - 1, allowance < legInUnits) + (allowance > 0n && allowance < legInUnits ? GAS.reset : 0n) + (tsdSide === "sell" ? GAS_USDC_TRANSFER : 0n);
  const nat = await balanceOf(net, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", evm);
  if (nat == null) throw new Error(`Couldn't read your ${DEX_NETWORKS[net].nativeSymbol} balance. Try again in a minute.`);
  const feeWhy = feeProblem(net, { needWei: feeNeedWei(net, units, fees.maxFeePerGas), haveWei: nat, valueWei: isNative(legIn) ? legInUnits : 0n });
  if (feeWhy) throw new Error(feeWhy);

  const { swapLimitsFor } = await import("@/lib/xchain/send-rules");
  const limits = swapLimitsFor(tester);
  const quotedOut = best.amountOut;
  const row = {
    user_id: userId, link_id: link!.id, network: net, from_address: evm, tsd_side: tsdSide ?? "", tsd_address: txc ?? "",
    bridge_fee_bps: tsdSide === "buy" ? bridge!.redeemFeeBps : tsdSide === "sell" ? bridge!.mintFeeBps : "",
    token_in: input.tokenIn, token_out: input.tokenOut, symbol_in: ia.symbol, symbol_out: ib.symbol,
    decimals_in: ia.decimals, decimals_out: ib.decimals, amount_in: amountIn, shown_out: input.shownOut,
    shown_leg_in_units: legInUnits.toString(), shown_leg_out_units: quotedOut.toString(),
    // A TSD buy picks its pool after TSD Bridge pays (the exact USDC isn't known until then).
    ...(tsdSide === "buy" ? {} : {
      amount_in_units: legInUnits.toString(), venue_id: venue.id, venue_name: venue.name, router: venue.router, kind: venue.kind,
      path: best.path, fees: best.fees, quoted_out_units: quotedOut.toString(), min_out_units: minOutUnits(quotedOut, input.slippageBps).toString(),
    }),
    venue_name: venue.name,
    slippage_bps: input.slippageBps, amount_usd: Math.round((amountUsd ?? 0) * 100) / 100,
  };
  { const { assertSwapLaneFree, coinLane } = await import("@/lib/swap/lanes.server"); const lanes = await import("@/lib/swap/lanes"); void coinLane; await assertSwapLaneFree(userId, { kind: "dex", lanes: lanes.dexLanes(net, input.tokenIn, input.tokenOut) }); }
  const { data: id, error } = await supabaseAdmin.rpc("reserve_dex_swap", { _row: row as never, _per_swap_max_usd: limits.perSwapUsd, _daily_max_usd: limits.dailyUsd });
  if (error || !id) throw new Error(clean(error?.message ?? "Could not start this swap."));
  const swapId = id as string;

  const minShown = tsdSide === "sell" ? finalOut * (1 - input.slippageBps / 10_000) : fromUnits(minOutUnits(quotedOut, input.slippageBps), ib.decimals);
  try {
    const { requestSendApproval } = await import("@/lib/pocket-send/approvals.server");
    const ap = await requestSendApproval({
      userId, linkId: link!.id, purpose: "dex_swap", refId: swapId, leg: `dex:${net}`, asset: ia.symbol, amount: amountIn,
      from: tsdSide === "buy" ? txc! : evm, to: evm,
      what: `Swap to about ${fmtNum(finalOut)} ${ib.symbol} (at least ${fmtNum(minShown)}) on ${venue.name}, ${DEX_NETWORKS[net].name}${tsdSide ? ", with TSD Bridge" : ""}. Paid back to your own pocket.`,
      meta: { network: net, tokenIn: input.tokenIn, tokenOut: input.tokenOut, venue: venue.id },
    });
    await supabaseAdmin.from("dex_swaps").update({ approval_id: ap.id, updated_at: new Date().toISOString() }).eq("id", swapId);
    return { id: swapId, approvalExpiresAt: ap.expires_at };
  } catch (e) {
    await supabaseAdmin.from("dex_swaps").update({ status: "cancelled", error: (e instanceof Error ? e.message : String(e)).slice(0, 300), updated_at: new Date().toISOString() }).eq("id", swapId);
    throw e;
  }
}

/** The pools can't take this hop right now (no pool, or the price is under what was agreed). Nothing was reserved. */
export class DexLegRefused extends Error {
  constructor(message: string, public freshOut: number | null = null) {
    super(message);
    this.name = "DexLegRefused";
  }
}

export type DexLegInput = {
  network: DexNetwork;
  tokenIn: string;
  tokenOut: string;
  amount: string;
  /** What the member was shown for this hop (coins out). */
  shownOut: number;
  slippageBps: number;
  /** Refuse below this, and never write a lower minimum into the swap (base units of tokenOut). */
  atLeastUnits: bigint;
  amountUsd: number;
  twoStepId: string;
};

/**
 * A pool hop of a two-step swap. The member's single Telegram tap was for the whole
 * two-step swap (spent there), so this row starts as approved — the database allows that
 * only for a two-step swap that is itself approved and running. Same pocket in and out.
 */
export async function startDexLeg(userId: string, tester: boolean, i: DexLegInput): Promise<{ id: string; quotedOut: number }> {
  const net = i.network;
  if (isTsdDex(i.tokenIn) || isTsdDex(i.tokenOut)) throw new Error("A two-step hop never trades TSD.");
  const { loadLink } = await import("@/lib/xchain/send.server");
  const link = await loadLink(userId);
  if (!link || link.mode !== "access" || !link.hasKey || !link.addresses.EVM) throw new Error("Your trading pocket was unlinked, so Seeds stopped this swap.");
  const evm = link.addresses.EVM;
  const [ia, ib] = await Promise.all([coinInfo(net, i.tokenIn), coinInfo(net, i.tokenOut)]);
  if (!ia || !ib) throw new Error(`That address isn't a coin on ${DEX_NETWORKS[net].name}.`);
  const units = toUnits(i.amount, ia.decimals);
  const amountIn = round8(fromUnits(units, ia.decimals));
  if (units <= 0n || !(amountIn > 0)) throw new Error("Amount too small.");
  const routes = await quoteRoutes(net, i.tokenIn, i.tokenOut, units);
  const best = routes[0];
  if (!best) throw new DexLegRefused(`No pool on ${DEX_NETWORKS[net].name} trades ${ia.symbol} → ${ib.symbol} right now.`);
  if (best.amountOut < i.atLeastUnits) throw new DexLegRefused("The pool price is under what you agreed.", fromUnits(best.amountOut, ib.decimals));
  const venue = venueById(net, best.venueId)!;
  const floor = minOutUnits(best.amountOut, i.slippageBps);
  const minOut = floor > i.atLeastUnits ? floor : i.atLeastUnits;
  const { swapLimitsFor } = await import("@/lib/xchain/send-rules");
  const limits = swapLimitsFor(tester);
  const row = {
    user_id: userId, link_id: link.id, network: net, from_address: evm, tsd_side: "", tsd_address: "", bridge_fee_bps: "",
    token_in: i.tokenIn, token_out: i.tokenOut, symbol_in: ia.symbol, symbol_out: ib.symbol,
    decimals_in: ia.decimals, decimals_out: ib.decimals, amount_in: amountIn, shown_out: i.shownOut > 0 ? i.shownOut : fromUnits(best.amountOut, ib.decimals),
    shown_leg_in_units: units.toString(), shown_leg_out_units: best.amountOut.toString(),
    amount_in_units: units.toString(), venue_id: venue.id, venue_name: venue.name, router: venue.router, kind: venue.kind,
    path: best.path, fees: best.fees, quoted_out_units: best.amountOut.toString(), min_out_units: minOut.toString(),
    slippage_bps: i.slippageBps, amount_usd: Math.round(Math.max(0, i.amountUsd) * 100) / 100,
  };
  const { data: id, error } = await supabaseAdmin.rpc("reserve_dex_swap", { _row: row as never, _per_swap_max_usd: limits.perSwapUsd, _daily_max_usd: limits.dailyUsd });
  if (error || !id) throw new DexLegRefused(clean(error?.message ?? "Could not start this swap."));
  const { data: ok, error: e2 } = await supabaseAdmin.from("dex_swaps")
    .update({ status: "approved", two_step_id: i.twoStepId, step_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id as string).eq("status", "awaiting_approval").select("id");
  if (e2 || !ok?.length) {
    await supabaseAdmin.from("dex_swaps").update({ status: "cancelled", error: "Two-step hop could not start", updated_at: new Date().toISOString() }).eq("id", id as string).eq("status", "awaiting_approval");
    throw new Error(clean(e2?.message ?? "This hop could not start. Nothing was sent."));
  }
  return { id: id as string, quotedOut: fromUnits(best.amountOut, ib.decimals) };
}

/** Members can call off a swap only while it still waits for their Telegram tap. */
export async function cancelDexSwap(userId: string, id: string) {
  const { data } = await supabaseAdmin.from("dex_swaps").update({ status: "cancelled", error: "Cancelled on the Swap page", updated_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", userId).eq("status", "awaiting_approval").select("id");
  if (!data?.length) throw new Error("This swap can't be cancelled any more.");
  const { cancelApprovals } = await import("@/lib/pocket-send/approvals.server");
  await cancelApprovals({ purpose: "dex_swap", refId: id }, "You cancelled this swap on the Swap page.");
}

/* ----------------------------------- advance ---------------------------------- */

async function claim(id: string): Promise<Row | null> {
  const now = new Date();
  const { data } = await supabaseAdmin
    .from("dex_swaps")
    .update({ working_until: new Date(now.getTime() + 90_000).toISOString() })
    .eq("id", id)
    .not("status", "in", "(done,failed,declined,expired,cancelled,kept_usdc)")
    .or(`working_until.is.null,working_until.lt.${now.toISOString()}`)
    .select("*")
    .maybeSingle();
  return (data as Row | null) ?? null;
}

async function save(id: string, patch: Partial<Row>) {
  const { error } = await supabaseAdmin.from("dex_swaps").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`Could not record the swap: ${error.message}`);
}

const move = (status: DexStatus, extra: Partial<Row> = {}): Partial<Row> => ({ status, step_at: new Date().toISOString(), error: null, ...extra });

async function notify(r: Row, text: string) {
  try {
    const { notifyUser } = await import("@/lib/telegram.server");
    await notifyUser(r.user_id, "notify_settlement", text);
  } catch (e) {
    console.error("dex swap alert failed", e);
  }
}

const net = (r: Row) => r.network as DexNetwork;
const legInToken = (r: Row) => (r.tsd_side === "buy" ? BRIDGE_USDC_ETH : r.token_in);
const legOutToken = (r: Row) => (r.tsd_side === "sell" ? BRIDGE_USDC_ETH : r.token_out);
const legOutDecimals = (r: Row) => (r.tsd_side === "sell" ? USDC_DECIMALS : r.decimals_out);
const stayNote = "Your coins stayed in your pocket.";

async function signAndSend(r: Row, field: "reset_txid" | "approve_txid" | "swap_txid", tx: { to: string; data: string; value: bigint; gas: bigint }, nonce: number,
  fees: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }) {
  const link = await sameLink(r.user_id, r.from_address, r.tsd_side === "buy" ? r.tsd_address : null);
  if (!link) throw new Error("Your trading pocket was unlinked, so Seeds stopped this swap. Nothing more was sent.");
  const { withPocketKey } = await import("@/lib/xchain/send.server");
  const { signEip1559 } = await import("@/lib/evm/tx.server");
  const { sendRawTransaction } = await import("@/lib/evm.server");
  const chainId = (await import("@/lib/chains")).getChain(chain(net(r))).evmChainId!;
  const signed = await withPocketKey(link, "EVM", link.addresses.EVM!, async (priv) =>
    signEip1559({ privateKeyHex: bytesToHex(priv), chainId, nonce, ...fees, gasLimit: tx.gas, to: tx.to, value: tx.value, data: tx.data }));
  if (!sameAddr(signed.from, r.from_address)) throw new Error("The stored key doesn't match your pocket address. Nothing was sent.");
  await save(r.id, { [field]: signed.hash } as Partial<Row>); // recorded before broadcast: never signed again
  try {
    await sendRawTransaction(chain(net(r)), signed.raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/rejected/i.test(msg)) throw Object.assign(new Error(msg), { refused: true });
    // Didn't hear back: the network may still have it. The receipt check decides.
  }
  return signed.hash;
}

/** One step. Returns true when the status changed (the caller may step again). */
const STOP = new Set(["failed", "kept_mid", "kept_usdc"]);
async function step(r: Row): Promise<boolean> {
  const status = r.status as DexStatus;
  const n = net(r);
  const go = async (patch: Partial<Row>) => {
    await save(r.id, patch);
    const changed = patch.status !== undefined && patch.status !== status;
    if (changed && !r.two_step_id && STOP.has(String(patch.status))) void (async () => {
      // Audit TD1: when the TSD Bridge step inside this swap already stopped, it sent the alert; don't send a second one.
      // If that step finished fine (or can't be read), this swap's own stop still alerts, so a stop is never silent.
      if (r.tsd_route_id) {
        const { data: rt } = await supabaseAdmin.from("tsd_routes").select("stage").eq("id", r.tsd_route_id).maybeSingle();
        if (rt && STOP.has(String(rt.stage))) return;
      }
      const m = await import("@/lib/swap/stop-alert.server");
      await m.alertSwapStopped({ userId: r.user_id, id: r.id, what: `${r.amount_in} ${r.symbol_in} → ${r.symbol_out}`, was: String(status), now: String(patch.status), why: patch.error });
    })().catch(() => undefined);
    return changed;
  };

  switch (status) {
    case "awaiting_approval": {
      if (!r.approval_id) return go(minutesSince(r.created_at) > 20 ? move("expired") : {});
      const { data: ap } = await supabaseAdmin.from("send_approvals").select("status, expires_at").eq("id", r.approval_id).maybeSingle();
      if (!ap) return go(move("cancelled", { error: "The approval request is missing." }));
      if (ap.status === "declined") return go(move("declined", { error: "Declined in Telegram. Nothing was sent." }));
      if (ap.status === "cancelled") return go(move("cancelled", { error: "The approval request was closed. Nothing was sent." }));
      if (ap.status === "expired" || (ap.status === "pending" && Date.parse(ap.expires_at) <= Date.now())) return go(move("expired", { error: "Not approved in time. Nothing was sent." }));
      if (ap.status !== "approved") return go({});
      if (!(await sameLink(r.user_id, r.from_address, r.tsd_side === "buy" ? r.tsd_address : null))) {
        return go(move("cancelled", { error: "Your wallet link changed since this request. Nothing was sent." }));
      }
      const { spendApproval } = await import("@/lib/pocket-send/approvals.server");
      await spendApproval({
        purpose: "dex_swap", id: r.approval_id, leg: `dex:${n}`, userId: r.user_id, linkId: r.link_id,
        amount: Number(r.amount_in), from: r.tsd_side === "buy" ? r.tsd_address! : r.from_address, to: r.from_address,
      });
      return go(move("approved"));
    }

    case "approved": {
      // Approved by its own tap, or as a hop of an approved two-step swap (the database checks the same).
      if (!r.approval_id && !r.two_step_id) return go(move("failed", { error: "This swap was never approved. Nothing was sent." }));
      if (r.tsd_side !== "buy") return go(move("ready"));
      const { startTsdRoute } = await import("@/lib/xchain/tsd-route.server");
      const { isTesterUser } = await import("@/lib/ai/execute.server");
      const shownUsdc = fromUnits(BigInt(r.shown_leg_in_units!), USDC_DECIMALS);
      try {
        const route = await startTsdRoute(r.user_id, await isTesterUser(r.user_id), { direction: "buy", coin: "USDC", amount: String(r.amount_in), shownOut: shownUsdc }, { waitForFirstSend: false });
        if (!route?.id) throw new Error("TSD Bridge step didn't start.");
        return go(move("bridging", { tsd_route_id: route.id }));
      } catch (e) {
        return go(move("failed", { error: `${e instanceof Error ? e.message : String(e)} Nothing was sent.`.slice(0, 300) }));
      }
    }

    case "bridging": {
      const { data: rt } = await supabaseAdmin.from("tsd_routes").select("stage, amount_out, error").eq("id", r.tsd_route_id!).maybeSingle();
      if (!rt) return go({ error: "TSD Bridge step not found; retrying." });
      if (rt.stage === "refunded") return go(move("failed", { error: "TSD Bridge returned your TSD to your pocket." }));
      if (rt.stage === "failed" || rt.stage === "kept_usdc") return go(move(rt.stage === "failed" ? "failed" : "kept_usdc", { error: rt.error ?? "TSD Bridge step stopped." }));
      if (rt.stage !== "done") {
        const { advanceRoute } = await import("@/lib/xchain/tsd-route.server");
        await advanceRoute(r.tsd_route_id!).catch(() => undefined);
        return go({});
      }
      const units = toUnits(String(Number(rt.amount_out ?? 0).toFixed(USDC_DECIMALS)), USDC_DECIMALS);
      if (units <= 0n) return go(move("kept_usdc", { error: "TSD Bridge paid no USDC we could see." }));
      const routes = await quoteRoutes(n, BRIDGE_USDC_ETH, r.token_out, units);
      const best = routes[0];
      const reference = scaledReference(BigInt(r.shown_leg_out_units!), BigInt(r.shown_leg_in_units!), units);
      if (!best || !requoteUnitsOk(reference, best.amountOut, TSD_LEG_TOLERANCE_BPS)) {
        void notify(r, `Seeds stopped your TSD → ${r.symbol_out} swap: the price moved more than ${TSD_LEG_TOLERANCE_BPS / 100}% while TSD Bridge converted. Your USDC is in your pocket; swap it on Seeds → Swap when you like.`);
        return go(move("kept_usdc", { error: `The price moved more than ${TSD_LEG_TOLERANCE_BPS / 100}% while TSD Bridge converted. Your USDC is in your pocket.` }));
      }
      const v = venueById(n, best.venueId)!;
      const floor = minOutUnits(best.amountOut < reference ? best.amountOut : reference, r.slippage_bps);
      return go(move("ready", {
        amount_in_units: units.toString(), venue_id: v.id, venue_name: v.name, router: v.router, kind: v.kind, path: best.path, fees: best.fees,
        quoted_out_units: best.amountOut.toString(), min_out_units: floor.toString(),
      }));
    }

    case "ready": {
      const v = venueById(n, r.venue_id!);
      if (!v || !sameAddr(v.router, r.router!)) return go(move("failed", { error: `Unknown pool. ${stayNote}` }));
      const amountIn = BigInt(r.amount_in_units!);
      const tokenIn = legInToken(r);
      const bal = await balanceOf(n, tokenIn, r.from_address);
      if (bal == null) return go({ error: "Couldn't read your pocket; retrying." });
      if (bal < amountIn) return go(move(r.tsd_side === "buy" ? "kept_usdc" : "failed", { error: `Your pocket no longer holds the full amount. Nothing was swapped.` }));
      const fees = await networkFees(n);
      if (!fees) return go({ error: `${DEX_NETWORKS[n].name} didn't answer; retrying.` });
      const nat = (await balanceOf(n, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", r.from_address)) ?? 0n;
      const { fetchNonce, estimateGas, evmCallDetailed } = await import("@/lib/evm.server");

      // 1) Pool permission for exactly this amount.
      if (!isNative(tokenIn)) {
        const allowance = await allowanceOf(n, tokenIn, r.from_address, v.router);
        if (allowance == null) return go({ error: "Couldn't read the pool permission; retrying." });
        const steps = approvalSteps(tokenIn, v.router, allowance, amountIn);
        if (steps.length) {
          if (r.approve_txid) return go(move("failed", { error: `The pool permission didn't take. ${stayNote}` }));
          const units = steps.reduce((s, x) => s + (x.reset ? GAS.reset : GAS.approve), 0n) + swapGasUnits(v.kind, (r.path?.length ?? 2) - 1, false);
          const why = feeProblem(n, { needWei: feeNeedWei(n, units, fees.maxFeePerGas), haveWei: nat, valueWei: 0n });
          if (why) return go(move(r.tsd_side === "buy" ? "kept_usdc" : "failed", { error: why }));
          const { withEvmSignLock, EvmSignBusy } = await import("@/lib/evm/sign-lock.server");
          // Audit LN2: nonce read → broadcast under the pocket's one-send-at-a-time hold.
          try {
            await withEvmSignLock(chain(n), r.from_address, async () => {
              let nonce = await fetchNonce(chain(n), r.from_address);
              if (nonce == null) throw new EvmSignBusy();
              for (const st of steps) {
                const est = await estimateGas(chain(n), { from: r.from_address, to: st.to, data: st.data });
                const gas = est ? (est * 13n) / 10n : st.reset ? GAS.reset : GAS.approve;
                await signAndSend(r, st.reset ? "reset_txid" : "approve_txid", { to: st.to, data: st.data, value: 0n, gas }, nonce++, fees);
              }
            });
          } catch (e) {
            if (e instanceof EvmSignBusy) return go({ error: "Couldn't read your pocket's transaction count or another send is going out; retrying." });
            throw e;
          }
          return go(move("approving"));
        }
      }

      // 2) The swap: fresh price must clear the agreed minimum, and a test run must pass.
      const fresh = await quoteExactRoute(n, { venueId: v.id, kind: v.kind, path: r.path!, fees: r.fees ?? [] }, amountIn);
      if (fresh == null) return go(minutesSince(r.step_at) > 30 ? move(r.tsd_side === "buy" ? "kept_usdc" : "failed", { error: `The pool didn't answer for 30 minutes. ${stayNote}` }) : { error: "The pool didn't answer; retrying." });
      const agreed = BigInt(r.min_out_units!);
      if (fresh < agreed) {
        void notify(r, `Seeds didn't swap your ${r.symbol_in}: the price fell below the minimum you agreed to. ${stayNote}`);
        return go(move(r.tsd_side === "buy" ? "kept_usdc" : "failed", { error: `The price fell below your minimum before the swap. Nothing was swapped. ${stayNote}` }));
      }
      const minOut = sendMinOut(agreed, fresh, r.slippage_bps);
      const call = buildSwapCall({
        network: n, venue: v, tokenIn, tokenOut: legOutToken(r), path: r.path!, fees: r.fees ?? [], amountIn, minOut,
        recipient: r.from_address, deadline: Math.floor(Date.now() / 1000) + DEADLINE_SECONDS,
      });
      const test = await evmCallDetailed(chain(n), { from: r.from_address, to: call.to, data: call.data, value: hex(call.value) });
      if (test == null) return go({ error: `${DEX_NETWORKS[n].name} didn't answer the test run; retrying.` });
      if (!test.ok) {
        return go(move(r.tsd_side === "buy" ? "kept_usdc" : "failed", {
          error: `A test run of the swap was refused (${test.error}). The coin may block sales or charge a hidden tax, or the price moved. Nothing was swapped.`.slice(0, 400),
        }));
      }
      const est = await estimateGas(chain(n), { from: r.from_address, to: call.to, data: call.data, value: hex(call.value) });
      const gas = est ? (est * 13n) / 10n : swapGasUnits(v.kind, r.path!.length - 1, false);
      const why = feeProblem(n, { needWei: feeNeedWei(n, gas, fees.maxFeePerGas), haveWei: nat, valueWei: call.value });
      if (why) return go(move(r.tsd_side === "buy" ? "kept_usdc" : "failed", { error: why }));
      const { withEvmSignLock, EvmSignBusy } = await import("@/lib/evm/sign-lock.server");
      try {
        // Audit LN2: nonce read → broadcast under the pocket's one-send-at-a-time hold.
        const hash = await withEvmSignLock(chain(n), r.from_address, async () => {
          const nonce = await fetchNonce(chain(n), r.from_address);
          if (nonce == null) throw new EvmSignBusy();
          return signAndSend(r, "swap_txid", { ...call, gas }, nonce, fees);
        });
        const { tellMember } = await import("@/lib/xchain/send.server");
        void tellMember(r.user_id, `Token swap sent on ${v.name}: ${fmtNum(fromUnits(amountIn, r.tsd_side === "buy" ? USDC_DECIMALS : r.decimals_in))} ${r.tsd_side === "buy" ? "USDC" : r.symbol_in} → ${r.tsd_side === "sell" ? "USDC" : r.symbol_out}. Tx ${hash}`, [
          `Swapped from your own trading pocket ${r.from_address} on ${v.name} (${DEX_NETWORKS[n].name})`,
          `Paid back to the same pocket; at least ${fmtNum(fromUnits(minOut, legOutDecimals(r)))} ${r.tsd_side === "sell" ? "USDC" : r.symbol_out} or the swap cancels itself`,
          `Network transaction ${hash}`,
        ]);
        return go(move("swapping"));
      } catch (e) {
        if (e instanceof EvmSignBusy) return go({ error: "Couldn't read your pocket's transaction count or another send is going out; retrying." });
        if ((e as { refused?: boolean }).refused) return go(move("failed", { error: `${(e as Error).message}. ${stayNote}`.slice(0, 300) }));
        throw e;
      }
    }

    case "approving": {
      const hash = r.approve_txid!;
      const rc = await receipt(n, hash);
      if (!rc) return go(minutesSince(r.step_at) > LOST_TX_MINUTES ? move("failed", { error: `The pool permission never reached the network. ${stayNote} The team will double-check.` }) : {});
      if (rc.status !== "0x1") return go(move(r.tsd_side === "buy" ? "kept_usdc" : "failed", { error: `The network refused the pool permission. ${stayNote}` }));
      if (r.reset_txid) {
        const rr = await receipt(n, r.reset_txid);
        if (!rr) return go({});
      }
      return go(move("ready"));
    }

    case "swapping": {
      const rc = await receipt(n, r.swap_txid!);
      if (!rc) return go(minutesSince(r.step_at) > LOST_TX_MINUTES ? move("failed", { error: "The swap never showed up on the network. The team will double-check." }) : {});
      if (rc.status !== "0x1") {
        void notify(r, `Your ${r.symbol_in} swap was refused on the network (price moved past your minimum, or the coin blocked it). ${stayNote} Only the network fee was spent.`);
        return go(move(r.tsd_side === "buy" ? "kept_usdc" : "failed", { error: `Refused on the network (price moved past your minimum, or the coin blocked it). ${stayNote} Only the network fee was spent.` }));
      }
      const got = receivedFromLogs(rc.logs ?? [], { network: n, tokenOut: legOutToken(r), recipient: r.from_address, router: r.router! });
      if (r.tsd_side === "sell") {
        const usdc = fromUnits(got, USDC_DECIMALS);
        const { startTsdRoute } = await import("@/lib/xchain/tsd-route.server");
        const { isTesterUser } = await import("@/lib/ai/execute.server");
        try {
          const shown = fromUnits(afterBridgeFeeUnits(got, r.bridge_fee_bps ?? 100), USDC_DECIMALS);
          const route = await startTsdRoute(r.user_id, await isTesterUser(r.user_id), { direction: "sell", coin: "USDC", amount: usdc.toFixed(USDC_DECIMALS), shownOut: shown }, { waitForFirstSend: false });
          if (!route?.id) throw new Error("TSD Bridge step didn't start.");
          return go(move("minting", { received_units: got.toString(), tsd_route_id: route.id }));
        } catch (e) {
          void notify(r, `Your swap to USDC finished, but the TSD Bridge step didn't start (${e instanceof Error ? e.message : e}). ${fmtNum(usdc)} USDC is in your pocket.`);
          return go(move("kept_usdc", { received_units: got.toString(), amount_out: usdc, error: `TSD Bridge step didn't start: ${e instanceof Error ? e.message : e}. Your USDC is in your pocket.`.slice(0, 300) }));
        }
      }
      const out = fromUnits(got, r.decimals_out);
      void notify(r, `Done: ${fmtNum(out)} ${r.symbol_out} is in your pocket on ${DEX_NETWORKS[n].name}. Tx ${r.swap_txid}`);
      return go(move("done", { received_units: got.toString(), amount_out: out }));
    }

    case "minting": {
      const { data: rt } = await supabaseAdmin.from("tsd_routes").select("stage, amount_out, error").eq("id", r.tsd_route_id!).maybeSingle();
      if (!rt) return go({});
      if (rt.stage === "done") {
        void notify(r, `Done: ${fmtNum(Number(rt.amount_out ?? 0))} TSD is in your pocket.`);
        return go(move("done", { amount_out: Number(rt.amount_out ?? 0) }));
      }
      if (rt.stage === "failed") return go(move("failed", { error: rt.error ?? "TSD Bridge step stopped." }));
      if (rt.stage === "refunded" || rt.stage === "kept_usdc") return go(move("kept_usdc", { error: rt.error ?? "TSD Bridge returned the USDC to your pocket." }));
      const { advanceRoute } = await import("@/lib/xchain/tsd-route.server");
      await advanceRoute(r.tsd_route_id!).catch(() => undefined);
      return go({});
    }

    default:
      return go({});
  }
}

export async function advanceDexSwap(id: string): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const r = await claim(id);
    if (!r) return;
    let changed = false;
    try {
      changed = await step(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("dex swap step failed", id, r.status, msg);
      await save(id, { error: msg.slice(0, 300) }).catch(() => undefined);
    } finally {
      await supabaseAdmin.from("dex_swaps").update({ working_until: null }).eq("id", id);
    }
    if (!changed) return;
  }
}

/** Every-minute job: move every open token swap along. */
export async function advanceOpenDexSwaps(): Promise<{ checked: number }> {
  const { data } = await supabaseAdmin
    .from("dex_swaps")
    .select("id")
    .not("status", "in", "(done,failed,declined,expired,cancelled,kept_usdc)")
    .order("created_at", { ascending: true })
    .limit(25);
  for (const r of data ?? []) await advanceDexSwap(r.id).catch((e) => console.error("dex swap advance failed", r.id, e));
  return { checked: data?.length ?? 0 };
}

/** The member's recent token swaps (their own rows only). Moves open ones along first. */
export async function listDexSwaps(userId: string) {
  const { data: open } = await supabaseAdmin.from("dex_swaps").select("id").eq("user_id", userId)
    .not("status", "in", "(done,failed,declined,expired,cancelled,kept_usdc)").limit(3);
  for (const r of open ?? []) await advanceDexSwap(r.id).catch(() => undefined);
  const { data, error } = await supabaseAdmin
    .from("dex_swaps")
    .select("id, network, tsd_side, token_in, token_out, symbol_in, symbol_out, decimals_out, amount_in, shown_out, min_out_units, venue_name, slippage_bps, approve_txid, swap_txid, amount_out, status, error, created_at, updated_at")
    .eq("user_id", userId)
    // A two-step swap's pool hop is shown inside that swap, never as a second row.
    .is("two_step_id", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    ...r,
    amount_in: Number(r.amount_in),
    shown_out: Number(r.shown_out),
    amount_out: r.amount_out == null ? null : Number(r.amount_out),
    min_out: r.min_out_units && r.tsd_side !== "sell" ? fromUnits(BigInt(r.min_out_units), r.decimals_out) : null,
    explorerTx: DEX_NETWORKS[r.network as DexNetwork].explorerTx,
    terminal: isDexTerminal(r.status),
  }));
}

export type { DexRoute };
