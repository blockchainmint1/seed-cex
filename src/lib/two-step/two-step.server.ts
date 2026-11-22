/**
 * Two-step swaps — server orchestrator. Rules and statuses: rules.ts; which pairs need it: src/lib/swap/plan.ts.
 *
 * Order is fixed and every step fails closed:
 *  1. request: the server re-quotes both hops (never trusts the browser), the result must be at most 1%
 *     worse than shown, the pocket must hold the coins and the network fee, then reserve_two_step_swap
 *     (one open per member, swap limits) and one Telegram Approve request for the whole swap.
 *  2. Approve tap: spent once for exactly this swap; nothing moves before.
 *  3. Hop 1 is an ordinary pool swap (startDexLeg, own pocket → own pocket, test run, hash before broadcast)
 *     or an ordinary THORChain/Maya send (sendSwapFromPocket with leg options: own pocket only).
 *  4. Hop 2 starts only when a fresh price for the coins that actually arrived (never more than the pocket
 *     holds) still clears the agreed minimum; otherwise Seeds stops and the in-between coin stays put.
 *  5. A hop's send whose outcome is unclear is never retried: the swap stops for a person to check.
 * The every-minute job (/api/public/jobs/tsd-routes), the Telegram tap and the Swap page call advanceTwoStep.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { PROTOCOL_LABEL, swapCoin, type Protocol, type SwapCoin } from "@/lib/xchain/assets";
import { toBaseUnits } from "@/lib/xchain/safety";
import { receivePocket, sendBlocker, sendSource } from "@/lib/xchain/send-rules";
import { DEX_NETWORKS, NATIVE, isNative, sameAddr, tokenRisk, venueById, type DexNetwork, type TokenRisk } from "@/lib/dex/venues";
import { MAX_SLIPPAGE_BPS, dexSwapBlocker, feeNeedWei, feeProblem, swapGasUnits } from "@/lib/dex/swap-rules";
import { agreedMinimum, dexTwin, floorAmount, planSwap, twoStepMids, twoStepProtocols, type TwoStepDirection } from "@/lib/swap/plan";
import { FIRST_HOP_TOLERANCE, HOP_WAIT_MINUTES, TWO_STEP_TESTERS_ONLY, isTwoStepTerminal, midToHandOn, stopForMissingMid, type TwoStepStatus } from "./rules";

type Row = Database["public"]["Tables"]["two_step_swaps"]["Row"];

const clean = (m: string) => m.replace(/^.*?ERROR:\s*/i, "").trim();
const fmtNum = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 1 ? 6 : 10 });
const minutesSince = (iso: string) => (Date.now() - Date.parse(iso)) / 60_000;
/** Gas for the THORChain/Maya deposit from Ethereum: plain Ether, or a token (permission + deposit). */
const GAS_X_NATIVE = 120_000n;
const GAS_X_TOKEN = 360_000n;

/* ---------------------------------- quote ---------------------------------- */

export type TwoStepQuoteInput = { direction: TwoStepDirection; network: DexNetwork; token: string; coin: string; amount: string };

export type TwoStepQuote = {
  ok: boolean;
  error: string | null;
  direction: TwoStepDirection;
  network: DexNetwork;
  token: { address: string; symbol: string; decimals: number };
  coin: string;
  amountIn: number;
  amountUsd: number | null;
  mid: { id: string; symbol: string } | null;
  midOut: number;
  protocol: Protocol | null;
  venueName: string | null;
  out: number;
  outUsd: number | null;
  swapFeeUsd: number | null;
  seconds: number | null;
  others: Array<{ mid: string; protocol: Protocol; out: number }>;
  risk: TokenRisk | null;
};

type Candidate = { pool: { route: import("@/lib/dex/quote.server").DexRoute; inUnits: bigint }; mid: SwapCoin; midOut: number; protocol: Protocol; venueName: string; out: number; outUsd: number | null; feeUsd: number | null; seconds: number | null; inputUsd: number | null };

async function decimalsOf(network: DexNetwork, address: string): Promise<number | null> {
  if (isNative(address)) return 18;
  const { tokenInfo } = await import("@/lib/dex/quote.server");
  return (await tokenInfo(network, address))?.decimals ?? null;
}

/** Best THORChain/Maya quote across the networks this hop may use. */
async function bestX(direction: TwoStepDirection, from: SwapCoin, to: SwapCoin, coin: SwapCoin, mid: SwapCoin, units: bigint) {
  const { protocolQuote } = await import("@/lib/xchain/router.server");
  const ps = twoStepProtocols(direction, coin, mid);
  const all = await Promise.all(ps.map(async (p) => ({ p, ...(await protocolQuote(p, from, to, units, null).catch(() => null)) })));
  const ok = all.filter((x) => x.route?.ok && x.route.expectedOut > 0).sort((a, b) => b.route!.expectedOut - a.route!.expectedOut);
  return { best: ok[0] ?? null, error: all.find((x) => x.route && !x.route.ok)?.route?.error ?? null };
}

export async function quoteTwoStep(i: TwoStepQuoteInput): Promise<TwoStepQuote> {
  const { fromUnits, quoteExactRoute, quoteRoutes, reverseRoute, toUnits, tokenInfo } = await import("@/lib/dex/quote.server");
  const { tokenMarket } = await import("@/lib/dex/market.server");
  const coin = swapCoin(i.coin);
  const [t, market] = await Promise.all([tokenInfo(i.network, i.token), tokenMarket(i.network, i.token).catch(() => null)]);
  const base: TwoStepQuote = {
    ok: false, error: null, direction: i.direction, network: i.network,
    token: { address: i.token, symbol: t?.symbol ?? "?", decimals: t?.decimals ?? 18 }, coin: i.coin,
    amountIn: Number(i.amount), amountUsd: null, mid: null, midOut: 0, protocol: null, venueName: null, out: 0, outUsd: null,
    swapFeeUsd: null, seconds: null, others: [], risk: null,
  };
  if (!coin || !t) return { ...base, error: "Pick two coins." };
  if (!(Number(i.amount) > 0)) return { ...base, error: "Enter an amount above zero." };
  const mids = twoStepMids(i.direction, i.network, coin).map((id) => swapCoin(id)!).filter(Boolean);
  if (!mids.length) return { ...base, error: "No plain coin links these two yet." };
  let lastError: string | null = null;

  const candidates = await Promise.all(mids.map(async (mid): Promise<Candidate | null> => {
    try {
      const tw = dexTwin(mid)!;
      const midDec = await decimalsOf(i.network, tw.address);
      if (midDec == null) return null;
      if (i.direction === "dex_then_x") {
        const units = toUnits(i.amount, t.decimals);
        const r1 = (await quoteRoutes(i.network, t.address, tw.address, units))[0];
        if (!r1) return null;
        const midOut = fromUnits(r1.amountOut, midDec);
        const midBase = toBaseUnits(floorAmount(midOut, 8));
        if (!midBase || midBase <= 0n) return null;
        const x = await bestX(i.direction, mid, coin, coin, mid, midBase);
        if (!x.best) { lastError = x.error ?? lastError; return null; }
        const r = x.best.route!;
        return { pool: { route: r1, inUnits: units }, mid, midOut, protocol: x.best.p, venueName: venueById(i.network, r1.venueId)?.name ?? r1.venueName, out: r.expectedOut, outUsd: r.expectedOutUsd, feeUsd: r.fees.totalUsd, seconds: r.seconds, inputUsd: null };
      }
      const units = toBaseUnits(floorAmount(Number(i.amount), 8));
      if (!units || units <= 0n) return null;
      const x = await bestX(i.direction, coin, mid, coin, mid, units);
      if (!x.best) { lastError = x.error ?? lastError; return null; }
      const r = x.best.route!;
      const midUnits = toUnits(floorAmount(r.expectedOut, midDec), midDec);
      const r2 = (await quoteRoutes(i.network, tw.address, t.address, midUnits))[0];
      if (!r2) return null;
      return {
        pool: { route: r2, inUnits: midUnits }, mid, midOut: r.expectedOut, protocol: x.best.p, venueName: venueById(i.network, r2.venueId)?.name ?? r2.venueName,
        out: fromUnits(r2.amountOut, t.decimals), outUsd: market?.priceUsd != null ? fromUnits(r2.amountOut, t.decimals) * market.priceUsd : null,
        feeUsd: r.fees.totalUsd, seconds: r.seconds, inputUsd: x.best.inputUsd ?? null,
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      return null;
    }
  }));
  const ok = candidates.filter((c): c is Candidate => c !== null).sort((a, b) => b.out - a.out);
  const best = ok[0];
  if (!best) return { ...base, error: lastError ?? "No route for these two coins right now." };
  // Sell-back check on the pool hop, as for a one-step pool swap.
  const back = await quoteExactRoute(i.network, reverseRoute(best.pool.route), best.pool.route.amountOut).catch(() => null);
  const roundTripLoss = back == null || best.pool.inUnits <= 0n ? null : Math.max(0, 1 - Number(back) / Number(best.pool.inUnits));
  const risk = tokenRisk({ liquidityUsd: market?.liquidityUsd ?? null, volume24hUsd: market?.volume24hUsd ?? null, ageDays: market?.ageDays ?? null, roundTripLoss, priceImpact: null });
  const amountUsd = i.direction === "dex_then_x" ? (market?.priceUsd != null ? Number(i.amount) * market.priceUsd : null) : best.inputUsd;
  return {
    ...base, ok: true, amountUsd, risk,
    mid: { id: best.mid.id, symbol: best.mid.symbol }, midOut: best.midOut, protocol: best.protocol, venueName: best.venueName,
    out: best.out, outUsd: best.outUsd, swapFeeUsd: best.feeUsd, seconds: (best.seconds ?? 0) + 60,
    others: ok.slice(1).map((c) => ({ mid: c.mid.symbol, protocol: c.protocol, out: c.out })),
  };
}

/* ---------------------------------- request ---------------------------------- */

export type TwoStepRequest = TwoStepQuoteInput & { shownOut: number; slippageBps: number };

export async function requestTwoStep(userId: string, tester: boolean, input: TwoStepRequest) {
  const coin = swapCoin(input.coin);
  if (!coin) throw new Error("Pick a coin.");
  if (!Number.isInteger(input.slippageBps) || input.slippageBps < 10 || input.slippageBps > MAX_SLIPPAGE_BPS) throw new Error("Pick a price protection between 0.1% and 10%.");
  const tokenSide = { kind: "token" as const, network: input.network, address: input.token, symbol: "?" };
  const coinSide = { kind: "coin" as const, id: coin.id };
  const plan = input.direction === "dex_then_x" ? planSwap(tokenSide, coinSide) : planSwap(coinSide, tokenSide);
  const fits = plan.options.some((o) => o.kind === "two" && o.direction === input.direction && o.network === input.network && sameAddr(o.token, input.token) && o.coin === coin.id);
  if (!fits) throw new Error(plan.problem ?? "These two coins don't need a two-step swap.");

  const { loadLink } = await import("@/lib/xchain/send.server");
  const link = await loadLink(userId);
  const { data: prof } = await supabaseAdmin.from("profiles").select("telegram_verified").eq("id", userId).maybeSingle();
  const linkLike = link ? { mode: link.mode, hasKey: link.hasKey, pockets: link.pockets as string[] } : null;
  if (TWO_STEP_TESTERS_ONLY && !tester) throw new Error("Two-step swaps are open to beta testers first. They open to members after that.");
  const gate = dexSwapBlocker({ tester, tsdSide: null, telegramVerified: prof?.telegram_verified === true, link: linkLike });
  if (gate) throw new Error(gate);

  const q = await quoteTwoStep(input);
  if (!q.ok || !q.mid || !q.protocol) throw new Error(q.error ?? "No route right now.");
  if (!(input.shownOut > 0) || q.out < input.shownOut * 0.99) {
    throw new Error(`The price moved more than 1% since you looked (now about ${fmtNum(q.out)}). Check the new quote and try again.`);
  }
  const mid = swapCoin(q.mid.id)!;
  const sender = input.direction === "dex_then_x" ? mid : coin;
  const blocked = sendBlocker({ from: sender, link: linkLike, isAdmin: tester, amountUsd: q.amountUsd, protocol: q.protocol });
  if (blocked) throw new Error(blocked);
  if (q.amountUsd == null && !tester) throw new Error("No live price for this coin, so the limit can't be checked.");

  const evm = link!.addresses.EVM;
  if (!evm) throw new Error("Your trading pocket has no EVM address yet.");
  const fromAddress = input.direction === "dex_then_x" ? evm : link!.addresses[sendSource(coin, q.protocol)!.pocket];
  const toPocket = input.direction === "dex_then_x" ? receivePocket(coin) : "EVM";
  const toAddress = toPocket ? link!.addresses[toPocket] : undefined;
  if (!fromAddress || !toAddress) throw new Error(`Your trading pocket has no ${input.direction === "dex_then_x" ? coin.network : DEX_NETWORKS[input.network].name} address yet. Sign in again to add it.`);

  // Coins set aside for open orders and trades stay put (set-asides.ts).
  {
    const { legForEvmToken, legForSwapAsset } = await import("@/lib/set-asides");
    const tokenNative = input.token.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const held = input.direction === "dex_then_x" ? legForEvmToken(input.network, tokenNative ? null : input.token) : legForSwapAsset(coin.asset);
    if (held) {
      const { pocketSpendProblem } = await import("@/lib/set-asides.server");
      const network = input.direction === "dex_then_x" ? input.network : null;
      const why = await pocketSpendProblem(userId, held, Number(input.amount), { address: fromAddress, network });
      if (why) throw new Error(why);
    }
  }

  // Coins and the network fee must already be in the pocket.
  const { dexBalanceOf, dexNetworkFees } = await import("@/lib/dex/swap.server");
  const { fromUnits, toUnits } = await import("@/lib/dex/quote.server");
  const net = input.network;
  const midTwin = dexTwin(mid)!;
  const [fees, nat] = await Promise.all([dexNetworkFees(net), dexBalanceOf(net, NATIVE, evm)]);
  if (!fees || nat == null) throw new Error(`${DEX_NETWORKS[net].name} didn't answer. Try again in a minute.`);
  if (input.direction === "dex_then_x") {
    const units = toUnits(floorAmount(Number(input.amount), q.token.decimals), q.token.decimals);
    const bal = await dexBalanceOf(net, input.token, evm);
    if (bal == null) throw new Error(`Couldn't read your pocket on ${DEX_NETWORKS[net].name}. Try again in a minute.`);
    if (bal < units) throw new Error(`Your pocket holds ${fmtNum(fromUnits(bal, q.token.decimals))} ${q.token.symbol} on ${DEX_NETWORKS[net].name}.`);
    const gas = swapGasUnits("v3", 2, !isNative(input.token)) + (isNative(midTwin.address) ? GAS_X_NATIVE : GAS_X_TOKEN);
    const why = feeProblem(net, { needWei: feeNeedWei(net, gas, fees.maxFeePerGas), haveWei: nat, valueWei: isNative(input.token) ? units : 0n });
    if (why) throw new Error(why);
  } else {
    // The pool hop's fee is paid from what is already there, not from the coins that arrive.
    const why = feeProblem(net, { needWei: feeNeedWei(net, swapGasUnits("v3", 2, !isNative(midTwin.address)), fees.maxFeePerGas), haveWei: nat, valueWei: 0n });
    if (why) throw new Error(`${why} Step 2 runs on ${DEX_NETWORKS[net].name}, so its fee must be in your pocket before you start.`);
  }

  const minOut = agreedMinimum(input.shownOut, input.slippageBps);
  const symbolIn = input.direction === "dex_then_x" ? q.token.symbol : coin.symbol;
  const symbolOut = input.direction === "dex_then_x" ? coin.symbol : q.token.symbol;
  const { swapLimitsFor } = await import("@/lib/xchain/send-rules");
  const limits = swapLimitsFor(tester);
  const row = {
    user_id: userId, link_id: link!.id, direction: input.direction, network: net,
    token_address: input.token, token_symbol: q.token.symbol, token_decimals: q.token.decimals,
    coin_id: coin.id, mid_id: mid.id, symbol_in: symbolIn, symbol_out: symbolOut, protocol: q.protocol,
    amount_in: Number(input.amount), shown_mid: q.midOut, shown_out: input.shownOut, min_out: minOut, slippage_bps: input.slippageBps,
    amount_usd: Math.round((q.amountUsd ?? 0) * 100) / 100, from_address: fromAddress, to_address: toAddress,
  };
  const { data: id, error } = await supabaseAdmin.rpc("reserve_two_step_swap", { _row: row as never, _per_swap_max_usd: limits.perSwapUsd, _daily_max_usd: limits.dailyUsd });
  if (error || !id) throw new Error(clean(error?.message ?? "Could not start this swap."));
  const swapId = id as string;

  const swapper = PROTOCOL_LABEL[q.protocol];
  const hops = input.direction === "dex_then_x"
    ? `${q.venueName} (${symbolIn} → ${mid.symbol}), then ${swapper} (${mid.symbol} → ${symbolOut})`
    : `${swapper} (${symbolIn} → ${mid.symbol}), then ${q.venueName} (${mid.symbol} → ${symbolOut})`;
  try {
    const { requestSendApproval } = await import("@/lib/pocket-send/approvals.server");
    const ap = await requestSendApproval({
      userId, linkId: link!.id, purpose: "two_step", refId: swapId, leg: "two_step", asset: symbolIn, amount: Number(input.amount),
      from: fromAddress, to: toAddress,
      what: `Swap to about ${fmtNum(input.shownOut)} ${symbolOut} (at least ${fmtNum(minOut)}) in two steps: ${hops}. Every step pays your own pocket.`,
      meta: { direction: input.direction, network: net, token: input.token, coin: coin.id, mid: mid.id },
    });
    await supabaseAdmin.from("two_step_swaps").update({ approval_id: ap.id, updated_at: new Date().toISOString() }).eq("id", swapId);
    return { id: swapId, approvalExpiresAt: ap.expires_at };
  } catch (e) {
    await supabaseAdmin.from("two_step_swaps").update({ status: "cancelled", error: (e instanceof Error ? e.message : String(e)).slice(0, 300), updated_at: new Date().toISOString() }).eq("id", swapId);
    throw e;
  }
}

/** Members can call off a two-step swap only while it still waits for their Telegram tap. */
export async function cancelTwoStep(userId: string, id: string) {
  const { data } = await supabaseAdmin.from("two_step_swaps").update({ status: "cancelled", error: "Cancelled on the Swap page", updated_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", userId).eq("status", "awaiting_approval").select("id");
  if (!data?.length) throw new Error("This swap can't be cancelled any more.");
  const { cancelApprovals } = await import("@/lib/pocket-send/approvals.server");
  await cancelApprovals({ purpose: "two_step", refId: id }, "You cancelled this swap on the Swap page.");
}

/* ---------------------------------- advance ---------------------------------- */

async function claim(id: string): Promise<Row | null> {
  const now = new Date();
  const { data } = await supabaseAdmin
    .from("two_step_swaps")
    .update({ working_until: new Date(now.getTime() + 120_000).toISOString() })
    .eq("id", id)
    .not("status", "in", "(done,failed,refunded,kept_mid,declined,expired,cancelled)")
    .or(`working_until.is.null,working_until.lt.${now.toISOString()}`)
    .select("*")
    .maybeSingle();
  return (data as Row | null) ?? null;
}

async function save(id: string, patch: Partial<Row>) {
  const { error } = await supabaseAdmin.from("two_step_swaps").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`Could not record the swap: ${error.message}`);
}

const move = (status: TwoStepStatus, extra: Partial<Row> = {}): Partial<Row> => ({ status, step_at: new Date().toISOString(), error: null, ...extra });

async function notify(r: Row, text: string) {
  try {
    const { notifyUser } = await import("@/lib/telegram.server");
    await notifyUser(r.user_id, "notify_settlement", text);
  } catch (e) {
    console.error("two-step alert failed", e);
  }
}

async function linkStillSame(r: Row): Promise<boolean> {
  const { loadLink } = await import("@/lib/xchain/send.server");
  const link = await loadLink(r.user_id);
  if (!link || link.mode !== "access" || !link.hasKey) return false;
  const addrs = Object.values(link.addresses);
  return addrs.includes(r.from_address) && addrs.includes(r.to_address);
}

/** What the swap network actually paid out of `asset` (1e8 units in /tx/status), or null if unreadable. */
async function paidOut(protocol: Protocol, txid: string, asset: string): Promise<number | null> {
  const { protocolTxStatus } = await import("@/lib/xchain/router.server");
  const { thorTxId } = await import("@/lib/xchain/send-rules");
  const s = (await protocolTxStatus(protocol, thorTxId(txid))) as { out_txs?: Array<{ memo?: string; coins?: Array<{ asset?: string; amount?: string }> }> } | null;
  const want = asset.toUpperCase();
  const out = s?.out_txs?.find((o) => /^OUT/i.test(o.memo ?? "") && (o.coins ?? []).some((x) => (x.asset ?? "").toUpperCase() === want));
  const c = out?.coins?.find((x) => (x.asset ?? "").toUpperCase() === want);
  const n = c?.amount ? Number(c.amount) / 1e8 : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

type XHop = { kind: "sent"; id: string; protocol: Protocol } | { kind: "price"; fresh: number } | { kind: "unavailable"; message: string };

/**
 * A THORChain/Maya send this hop already made since the step started (a crash after broadcast
 * must never send twice). Only sends tagged with this two-step swap count, so a member's own
 * separate swap of the same coins is never taken for a step (audit T1).
 */
async function sentSince(r: Row, from: SwapCoin, to: SwapCoin): Promise<{ id: string; protocol: Protocol } | null> {
  const { data } = await supabaseAdmin.from("swap_sends").select("id, protocol, status")
    .eq("user_id", r.user_id).eq("parent_id", r.id).eq("from_asset", from.asset).eq("to_asset", to.asset).gte("created_at", r.step_at)
    .neq("status", "failed").order("created_at", { ascending: false }).limit(1);
  const s = data?.[0];
  return s ? { id: s.id, protocol: s.protocol === "maya" ? "maya" : "thorchain" } : null;
}

async function sendXHop(r: Row, i: { from: SwapCoin; to: SwapCoin; amount: string; destination: string; shownOut: number; tolerance: number }): Promise<XHop> {
  const earlier = await sentSince(r, i.from, i.to);
  if (earlier) return { kind: "sent", ...earlier };
  const { sendSwapFromPocket, PriceMovedError, RouteUnavailableError } = await import("@/lib/xchain/send.server");
  const chosen: Protocol = r.protocol === "maya" ? "maya" : "thorchain";
  const coin = swapCoin(r.coin_id)!, mid = swapCoin(r.mid_id)!;
  const order = [chosen, ...twoStepProtocols(r.direction as TwoStepDirection, coin, mid).filter((p) => p !== chosen)];
  let last = "No swap network can take this step right now.";
  for (const protocol of order) {
    try {
      const sent = await sendSwapFromPocket(r.user_id, false, {
        from: i.from.id, to: i.to.id, amount: i.amount, destination: i.destination, shownOut: i.shownOut, protocol,
      }, { routeId: r.id, tolerance: i.tolerance });
      if (sent.needsApproval) throw new Error("A two-step swap pays only your own pocket.");
      return { kind: "sent", id: sent.id, protocol };
    } catch (e) {
      if (e instanceof PriceMovedError) return { kind: "price", fresh: e.freshOut };
      if (e instanceof RouteUnavailableError) { last = e.message; continue; }
      // Might have reached the network: adopt it if it was recorded, otherwise let the caller stop.
      const after = await sentSince(r, i.from, i.to);
      if (after) return { kind: "sent", ...after };
      throw e;
    }
  }
  return { kind: "unavailable", message: last };
}

/** Where a THORChain/Maya hop stands; on delivery, how much of `asset` it paid. */
async function followX(r: Row, id: string, asset: string): Promise<{ state: "wait" | "done" | "refunded" | "failed"; paid: number | null; expected: number }> {
  const { refreshSwapSends } = await import("@/lib/xchain/send.server");
  await refreshSwapSends(r.user_id).catch(() => undefined);
  const { data: s } = await supabaseAdmin.from("swap_sends").select("status, txid, expected_out, protocol").eq("id", id).maybeSingle();
  if (!s) return { state: "wait", paid: null, expected: 0 };
  const expected = Number(s.expected_out);
  if (s.status === "done") {
    const p: Protocol = s.protocol === "maya" ? "maya" : "thorchain";
    return { state: "done", paid: s.txid ? await paidOut(p, s.txid, asset).catch(() => null) : null, expected };
  }
  if (s.status === "refunded") return { state: "refunded", paid: null, expected };
  if (s.status === "failed") return { state: "failed", paid: null, expected };
  return { state: "wait", paid: null, expected };
}

async function followDex(id: string) {
  const { data: d } = await supabaseAdmin.from("dex_swaps").select("status, received_units, decimals_out, amount_out, error").eq("id", id).maybeSingle();
  if (!d) return null;
  const { isDexTerminal } = await import("@/lib/dex/swap-rules");
  if (!isDexTerminal(d.status)) {
    const { advanceDexSwap } = await import("@/lib/dex/swap.server");
    await advanceDexSwap(id).catch(() => undefined);
    const { data: again } = await supabaseAdmin.from("dex_swaps").select("status, received_units, decimals_out, amount_out, error").eq("id", id).maybeSingle();
    return again ?? d;
  }
  return d;
}

/** A pool hop this swap already started since the step began (never start a second one). */
async function dexSince(r: Row, tokenIn: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("dex_swaps").select("id, token_in").eq("two_step_id", r.id).gte("created_at", r.step_at)
    .not("status", "in", "(cancelled)").order("created_at", { ascending: false }).limit(3);
  return (data ?? []).find((d) => sameAddr(d.token_in, tokenIn))?.id ?? null;
}

async function step(r: Row): Promise<boolean> {
  const status = r.status as TwoStepStatus;
  const go = async (patch: Partial<Row>) => {
    await save(r.id, patch);
    return patch.status !== undefined && patch.status !== status;
  };
  const net = r.network as DexNetwork;
  const dir = r.direction as TwoStepDirection;
  const coin = swapCoin(r.coin_id), mid = swapCoin(r.mid_id);
  if (!coin || !mid) return go(move("failed", { error: "Unknown coin. Nothing was sent." }));
  const midTwin = dexTwin(mid)!;
  const midIn = `Your ${mid.symbol} is in your trading pocket; swap it on Seeds → Swap when you like.`;
  const { fromUnits, toUnits } = await import("@/lib/dex/quote.server");
  const { isTesterUser } = await import("@/lib/ai/execute.server");

  switch (status) {
    case "awaiting_approval": {
      if (!r.approval_id) return go(minutesSince(r.created_at) > 20 ? move("expired") : {});
      const { data: ap } = await supabaseAdmin.from("send_approvals").select("status, expires_at").eq("id", r.approval_id).maybeSingle();
      if (!ap) return go(move("cancelled", { error: "The approval request is missing." }));
      if (ap.status === "declined") return go(move("declined", { error: "Declined in Telegram. Nothing was sent." }));
      if (ap.status === "cancelled") return go(move("cancelled", { error: "The approval request was closed. Nothing was sent." }));
      if (ap.status === "expired" || (ap.status === "pending" && Date.parse(ap.expires_at) <= Date.now())) return go(move("expired", { error: "Not approved in time. Nothing was sent." }));
      if (ap.status !== "approved") return go({});
      if (!(await linkStillSame(r))) return go(move("cancelled", { error: "Your wallet link changed since this request. Nothing was sent." }));
      const { spendApproval } = await import("@/lib/pocket-send/approvals.server");
      await spendApproval({ purpose: "two_step", id: r.approval_id, leg: "two_step", userId: r.user_id, linkId: r.link_id, amount: Number(r.amount_in), from: r.from_address, to: r.to_address });
      return go(move("approved"));
    }

    case "approved": {
      if (!(await linkStillSame(r))) return go(move("failed", { error: "Your trading pocket was unlinked, so Seeds stopped this swap. Nothing was sent." }));
      const tester = await isTesterUser(r.user_id);
      if (dir === "dex_then_x") {
        const already = await dexSince(r, r.token_address);
        if (already) return go(move("leg1", { dex_swap_id: already }));
        const midDec = (await decimalsOf(net, midTwin.address)) ?? 18;
        const { startDexLeg, DexLegRefused } = await import("@/lib/dex/swap.server");
        try {
          const leg = await startDexLeg(r.user_id, tester, {
            network: net, tokenIn: r.token_address, tokenOut: midTwin.address, amount: floorAmount(Number(r.amount_in), r.token_decimals),
            shownOut: Number(r.shown_mid), slippageBps: r.slippage_bps,
            atLeastUnits: toUnits(floorAmount(Number(r.shown_mid) * (1 - FIRST_HOP_TOLERANCE), midDec), midDec),
            amountUsd: Number(r.amount_usd), twoStepId: r.id,
          });
          const { advanceDexSwap } = await import("@/lib/dex/swap.server");
          void advanceDexSwap(leg.id).catch(() => undefined);
          return go(move("leg1", { dex_swap_id: leg.id }));
        } catch (e) {
          const why = e instanceof DexLegRefused && e.freshOut != null ? `The price moved more than ${FIRST_HOP_TOLERANCE * 100}% before step 1.` : (e instanceof Error ? e.message : String(e));
          return go(move("failed", { error: `${why} Nothing was sent.`.slice(0, 300) }));
        }
      }
      // Note the middle coin already in the pocket before step 1, so step 2 only ever hands on what arrived (audit T4).
      if (r.mid_baseline_units == null) {
        const { dexBalanceOf } = await import("@/lib/dex/swap.server");
        const before = await dexBalanceOf(net, midTwin.address, r.to_address);
        if (before == null) return go({ error: `Couldn't read your ${mid.symbol} balance before step 1; retrying.` });
        const { data: noted, error: be } = await supabaseAdmin.from("two_step_swaps").update({ mid_baseline_units: before.toString() } as never)
          .eq("id", r.id).eq("status", "approved").is("mid_baseline_units", null).select("id");
        if (be || !noted?.length) return go({ error: "Couldn't note your starting balance; retrying." });
      }
      try {
        const hop = await sendXHop(r, { from: coin, to: mid, amount: floorAmount(Number(r.amount_in), 8), destination: r.to_address, shownOut: Number(r.shown_mid), tolerance: FIRST_HOP_TOLERANCE });
        if (hop.kind === "price") return go(move("failed", { error: `The price moved more than ${FIRST_HOP_TOLERANCE * 100}% before step 1. Nothing was sent.` }));
        if (hop.kind === "unavailable") return go(move("failed", { error: `${hop.message} Nothing was sent.`.slice(0, 300) }));
        return go(move("leg1", { swap_send_id: hop.id }));
      } catch (e) {
        // sendXHop adopts any send that may have gone out, so reaching here means none did.
        return go(move("failed", { error: `Step 1 didn't start: ${e instanceof Error ? e.message : e}. Nothing was sent.`.slice(0, 400) }));
      }
    }

    case "leg1": {
      if (dir === "dex_then_x") {
        const d = await followDex(r.dex_swap_id!);
        if (!d) return go({ error: "Lost track of step 1; retrying." });
        if (d.status === "done" && d.received_units) {
          const got = fromUnits(BigInt(d.received_units), d.decimals_out);
          return go(move("mid", { mid_amount: got }));
        }
        if (["failed", "declined", "expired", "cancelled", "kept_usdc"].includes(d.status)) {
          void notify(r, `Your two-step swap stopped at step 1 (${d.error ?? "the pool swap didn't go through"}). Your ${r.symbol_in} stayed in your pocket.`);
          return go(move("failed", { error: `Step 1 stopped: ${d.error ?? "the pool swap didn't go through"}. Your ${r.symbol_in} stayed in your pocket.`.slice(0, 400) }));
        }
        return go({});
      }
      const f = await followX(r, r.swap_send_id!, mid.asset);
      if (f.state === "refunded") {
        void notify(r, `${PROTOCOL_LABEL[r.protocol as Protocol]} refunded step 1 of your two-step swap. Your ${r.symbol_in} is back in your pocket.`);
        return go(move("refunded", { error: `Step 1 was refunded. Your ${r.symbol_in} is back in your pocket.` }));
      }
      if (f.state === "failed") return go(move("failed", { error: "Step 1 didn't go out. Nothing was sent." }));
      if (f.state === "wait") return go({});
      const reported = f.paid ?? (minutesSince(r.step_at) > HOP_WAIT_MINUTES ? f.expected : null);
      if (reported == null) return go({ error: "Waiting to read how much arrived." });
      const { dexBalanceOf } = await import("@/lib/dex/swap.server");
      const dec = (await decimalsOf(net, midTwin.address)) ?? 18;
      const bal = await dexBalanceOf(net, midTwin.address, r.to_address);
      // Whole-coin view of the noted starting balance (rounding is far below a coin's smallest unit).
      const base = r.mid_baseline_units == null ? null : Number(r.mid_baseline_units) / 10 ** dec;
      const hand = midToHandOn(reported, bal == null ? null : fromUnits(bal, dec), base);
      if (hand == null) {
        // The member may spend the middle coin meanwhile (other swaps stay allowed): never wait forever.
        // Only after the wait, and only once the previous check also saw nothing new (a just-landed payout gets a minute to show).
        const sawNothingBefore = (r.error ?? "").startsWith(`Waiting for the ${mid.symbol} to show`);
        if (stopForMissingMid(minutesSince(r.step_at), sawNothingBefore, bal != null)) {
          const why = `The ${mid.symbol} from step 1 wasn't found in your pocket above what you had before the swap, so Seeds stopped before step 2.`;
          void notify(r, `${why} Any ${mid.symbol} that arrived stays in your pocket.`);
          return go(move("kept_mid", { error: `${why} Any ${mid.symbol} that arrived stays in your pocket.`.slice(0, 400) }));
        }
        return go({ error: `Waiting for the ${mid.symbol} to show in your pocket.` });
      }
      return go(move("mid", { mid_amount: hand }));
    }

    case "mid": {
      const midAmount = Number(r.mid_amount);
      const waitOrStop = (why: string): Partial<Row> => {
        if (minutesSince(r.step_at) <= HOP_WAIT_MINUTES) return { error: `${why} Retrying.`.slice(0, 300) };
        void notify(r, `Seeds stopped your two-step swap before step 2: ${why} ${midIn}`);
        return move("kept_mid", { error: `${why} ${midIn}`.slice(0, 400) });
      };
      if (!(await linkStillSame(r))) return go(move("kept_mid", { error: `Your trading pocket was unlinked, so Seeds stopped before step 2. ${midIn}` }));
      if (dir === "x_then_dex") {
        const already = await dexSince(r, midTwin.address);
        if (already) return go(move("leg2", { leg2_dex_swap_id: already }));
        const midDec = (await decimalsOf(net, midTwin.address)) ?? 18;
        const { startDexLeg, DexLegRefused, advanceDexSwap } = await import("@/lib/dex/swap.server");
        try {
          const leg = await startDexLeg(r.user_id, await isTesterUser(r.user_id), {
            network: net, tokenIn: midTwin.address, tokenOut: r.token_address, amount: floorAmount(midAmount, midDec),
            shownOut: Number(r.shown_out), slippageBps: r.slippage_bps,
            atLeastUnits: toUnits(floorAmount(Number(r.min_out), r.token_decimals), r.token_decimals),
            amountUsd: Number(r.amount_usd), twoStepId: r.id,
          });
          void advanceDexSwap(leg.id).catch(() => undefined);
          return go(move("leg2", { leg2_dex_swap_id: leg.id }));
        } catch (e) {
          if (e instanceof DexLegRefused && e.freshOut != null) {
            void notify(r, `Seeds stopped your two-step swap before step 2: the price fell below the minimum you agreed (now about ${fmtNum(e.freshOut)} ${r.symbol_out}). ${midIn}`);
            return go(move("kept_mid", { error: `The price fell below your minimum before step 2. ${midIn}` }));
          }
          return go(waitOrStop(e instanceof Error ? e.message : String(e)));
        }
      }
      try {
        const hop = await sendXHop(r, { from: mid, to: coin, amount: floorAmount(midAmount, 8), destination: r.to_address, shownOut: Number(r.min_out), tolerance: 0 });
        if (hop.kind === "price") {
          void notify(r, `Seeds stopped your two-step swap before step 2: the price fell below the minimum you agreed (now about ${fmtNum(hop.fresh)} ${r.symbol_out}). ${midIn}`);
          return go(move("kept_mid", { error: `The price fell below your minimum before step 2. ${midIn}` }));
        }
        if (hop.kind === "unavailable") return go(waitOrStop(hop.message));
        return go(move("leg2", { leg2_swap_send_id: hop.id }));
      } catch (e) {
        void notify(r, `Seeds stopped your two-step swap before step 2. ${midIn}`);
        return go(move("kept_mid", { error: `Step 2 didn't start: ${e instanceof Error ? e.message : e}. ${midIn}`.slice(0, 400) }));
      }
    }

    case "leg2": {
      if (dir === "x_then_dex") {
        const d = await followDex(r.leg2_dex_swap_id!);
        if (!d) return go({ error: "Lost track of step 2; retrying." });
        if (d.status === "done") {
          const out = d.amount_out != null ? Number(d.amount_out) : d.received_units ? fromUnits(BigInt(d.received_units), d.decimals_out) : 0;
          void notify(r, `Done: ${fmtNum(out)} ${r.symbol_out} is in your trading pocket on ${DEX_NETWORKS[net].name}.`);
          return go(move("done", { amount_out: out }));
        }
        if (["failed", "declined", "expired", "cancelled", "kept_usdc"].includes(d.status)) {
          void notify(r, `Step 2 of your two-step swap didn't go through (${d.error ?? "pool refused"}). ${midIn}`);
          return go(move("kept_mid", { error: `Step 2 stopped: ${d.error ?? "the pool swap didn't go through"}. ${midIn}`.slice(0, 400) }));
        }
        return go({});
      }
      const f = await followX(r, r.leg2_swap_send_id!, coin.asset);
      if (f.state === "done") {
        const out = f.paid ?? f.expected;
        void notify(r, `Done: about ${fmtNum(out)} ${r.symbol_out} is in your trading pocket.`);
        return go(move("done", { amount_out: out }));
      }
      if (f.state === "refunded") {
        void notify(r, `${PROTOCOL_LABEL[r.protocol as Protocol]} refunded step 2 of your two-step swap (price protection). ${midIn}`);
        return go(move("kept_mid", { error: `Step 2 was refunded. ${midIn}` }));
      }
      if (f.state === "failed") return go(move("kept_mid", { error: `Step 2 didn't go out. ${midIn}` }));
      return go({});
    }

    default:
      return go({});
  }
}

export async function advanceTwoStep(id: string): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const r = await claim(id);
    if (!r) return;
    let changed = false;
    try {
      changed = await step(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("two-step step failed", id, r.status, msg);
      await save(id, { error: msg.slice(0, 300) }).catch(() => undefined);
    } finally {
      await supabaseAdmin.from("two_step_swaps").update({ working_until: null }).eq("id", id);
    }
    if (!changed) return;
  }
}

/** Every-minute job: move every open two-step swap along. */
export async function advanceOpenTwoSteps(): Promise<{ checked: number }> {
  const { data } = await supabaseAdmin.from("two_step_swaps").select("id")
    .not("status", "in", "(done,failed,refunded,kept_mid,declined,expired,cancelled)")
    .order("created_at", { ascending: true }).limit(25);
  for (const r of data ?? []) await advanceTwoStep(r.id).catch((e) => console.error("two-step advance failed", r.id, e));
  return { checked: data?.length ?? 0 };
}

/** The member's recent two-step swaps (their own rows only), with each hop's transaction. Moves open ones along first. */
export async function listTwoSteps(userId: string) {
  const { data: open } = await supabaseAdmin.from("two_step_swaps").select("id").eq("user_id", userId)
    .not("status", "in", "(done,failed,refunded,kept_mid,declined,expired,cancelled)").limit(2);
  for (const r of open ?? []) await advanceTwoStep(r.id).catch(() => undefined);
  const { data, error } = await supabaseAdmin.from("two_step_swaps")
    .select("id, direction, network, mid_id, symbol_in, symbol_out, protocol, amount_in, shown_out, min_out, mid_amount, amount_out, status, error, dex_swap_id, swap_send_id, leg2_dex_swap_id, leg2_swap_send_id, created_at")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const dexIds = rows.flatMap((r) => [r.dex_swap_id, r.leg2_dex_swap_id]).filter((x): x is string => Boolean(x));
  const sendIds = rows.flatMap((r) => [r.swap_send_id, r.leg2_swap_send_id]).filter((x): x is string => Boolean(x));
  const [dex, sends] = await Promise.all([
    dexIds.length ? supabaseAdmin.from("dex_swaps").select("id, swap_txid, venue_name").in("id", dexIds) : Promise.resolve({ data: [] as Array<{ id: string; swap_txid: string | null; venue_name: string | null }> }),
    sendIds.length ? supabaseAdmin.from("swap_sends").select("id, txid, protocol").in("id", sendIds) : Promise.resolve({ data: [] as Array<{ id: string; txid: string | null; protocol: string }> }),
  ]);
  const dexBy = new Map((dex.data ?? []).map((d) => [d.id, d]));
  const sendBy = new Map((sends.data ?? []).map((s) => [s.id, s]));
  return rows.map((r) => {
    const net = r.network as DexNetwork;
    const pool = dexBy.get(r.dex_swap_id ?? r.leg2_dex_swap_id ?? "");
    const x = sendBy.get(r.swap_send_id ?? r.leg2_swap_send_id ?? "");
    return {
      ...r,
      amount_in: Number(r.amount_in), shown_out: Number(r.shown_out), min_out: Number(r.min_out),
      mid_amount: r.mid_amount == null ? null : Number(r.mid_amount), amount_out: r.amount_out == null ? null : Number(r.amount_out),
      mid_symbol: swapCoin(r.mid_id)?.symbol ?? r.mid_id,
      pool: pool?.venue_name ?? DEX_NETWORKS[net].venues[0]?.name ?? "Pool",
      poolTx: pool?.swap_txid ? `${DEX_NETWORKS[net].explorerTx}${pool.swap_txid}` : null,
      xTxid: x?.txid ?? null, xProtocol: (x?.protocol === "maya" ? "maya" : "thorchain") as Protocol,
      networkName: DEX_NETWORKS[net].name,
      terminal: isTwoStepTerminal(r.status),
    };
  });
}
