/**
 * One-tap HYPE swaps — server orchestrator. Rules: rules.ts; which pairs: src/lib/swap/plan.ts (kind "hype_chain").
 *
 * Fixed order, every step fails closed:
 *  1. request: server quotes both hops itself, result at most 1% worse than shown, set-asides
 *     checked, reserve_hype_chain (one open per member) and ONE Telegram Approve for the whole swap.
 *  2. Approve tap: spent once for exactly this swap.
 *  3. Before step 1 the pocket's ETH balance is noted once (eth_baseline_wei, write-once).
 *  4. Step 1: THORChain/Maya send (swap_sends.parent_id), TSD route (tsd_routes.parent_id) or Relay
 *     (relay_swaps.parent_id, reserve_relay_leg). A step is adopted, never re-sent.
 *  5. Step 2 hands on only ETH that arrived (ethToHandOn, less its fee) and only when a fresh price
 *     clears the agreed minimum; otherwise the ETH stays in the pocket (kept_mid).
 * The every-minute job (/api/public/jobs/tsd-routes), the Telegram tap and My swaps call advanceHypeChain.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { swapCoin, type Protocol, type SwapCoin } from "@/lib/xchain/assets";
import { toBaseUnits } from "@/lib/xchain/safety";
import { receivePocket, sendSource } from "@/lib/xchain/send-rules";
import { floorAmount } from "@/lib/swap/plan";
import { agreedMinWei, fromWei, toWei, fromUnits, toUnits, legs, type RelayDirection } from "@/lib/relay/rules";
import {
  HOP_STUCK_MINUTES, chainStatusLabel, hasTonStep, tonToHandOn, TON_STEP_RESERVE_NANO, relayIsSecond, chainEndSymbol, relayLegDirection, chainMinimum, chainSteps, ethToHandOn, isHypeChainTerminal, secondHopOk,
  type HypeChainDirection, type HypeChainStatus, type HypeChainVia,
} from "./rules";

type Row = Database["public"]["Tables"]["hype_chains"]["Row"];
const clean = (m: string) => m.replace(/^.*?ERROR:\s*/i, "").trim();
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 1 ? 6 : 8 });
const minutesSince = (iso: string) => (Date.now() - Date.parse(iso)) / 60_000;
/** Gas reserved from the arrived ETH for step 2 when it is a THORChain/Maya or TSD send from Ethereum. */
const GAS_ETH_SEND = 150_000n;
const RELAY_GAS = 60_000n;

const eth = () => swapCoin("ETH")!;
const symbolOf = (coinId: string) => (coinId === "TSD" ? "TSD" : swapCoin(coinId)?.symbol ?? coinId);

/* ---------------------------------- quotes ---------------------------------- */

/** Best THORChain/Maya quote for from -> to where Seeds can send `from`. */
async function bestX(from: SwapCoin, to: SwapCoin, amount: number) {
  const units = toBaseUnits(floorAmount(amount, 8));
  if (!units || units <= 0n) return null;
  const { protocolQuote } = await import("@/lib/xchain/router.server");
  const ps = from.protocols.filter((p) => to.protocols.includes(p) && sendSource(from, p) !== null);
  const all = await Promise.all(ps.map(async (p) => ({ p, ...(await protocolQuote(p, from, to, units, null).catch(() => null)) })));
  const ok = all.filter((x) => x.route?.ok && x.route.expectedOut > 0).sort((a, b) => b.route!.expectedOut - a.route!.expectedOut);
  const b = ok[0];
  return b ? { protocol: b.p as Protocol, out: b.route!.expectedOut, inputUsd: b.inputUsd ?? null, seconds: b.route!.seconds ?? null } : null;
}

/** Quote the non-HYPE hop: side -> ETH (to_hype) or ETH -> side (from_hype). */
async function quoteSideHop(direction: HypeChainDirection, via: HypeChainVia, coinId: string, amount: number) {
  if (via === "tsd") {
    const { quoteTsdRoute } = await import("@/lib/xchain/tsd-route.server");
    const q = await quoteTsdRoute(relayIsSecond(direction) ? "buy" : "sell", eth(), floorAmount(amount, 8));
    if (!q.ok) throw new Error(q.error ?? "TSD Bridge has no route right now.");
    return { out: q.out, protocol: (q.protocol ?? "thorchain") as Protocol, inputUsd: q.amountUsd, seconds: q.seconds };
  }
  const coin = swapCoin(coinId);
  if (!coin) throw new Error("Pick a coin.");
  const q = relayIsSecond(direction) ? await bestX(coin, eth(), amount) : await bestX(eth(), coin, amount);
  if (!q) throw new Error(`THORChain and Maya have no ${relayIsSecond(direction) ? `${coin.symbol} → ETH` : `ETH → ${coin.symbol}`} route right now.`);
  return q;
}

async function ethFeeWei(units: bigint): Promise<bigint> {
  const { fees } = await import("@/lib/relay/relay.server");
  const f = await fees("ethereum");
  if (!f) throw new Error("Ethereum didn't answer. Try again in a minute.");
  return (units * f.maxFeePerGas * 15n) / 10n;
}

export type HypeChainQuoteInput = { direction: HypeChainDirection; via: HypeChainVia; coin: string; amount: string };

export async function quoteHypeChain(i: HypeChainQuoteInput) {
  const amount = Number(i.amount);
  if (!(amount > 0)) throw new Error("Enter an amount above zero.");
  const { relayQuote, SAMPLE_TON } = await import("@/lib/relay/relay.server");
  const who = "0x000000000000000000000000000000000000dEaD";
  if (relayIsSecond(i.direction)) {
    const h1 = await quoteSideHop(i.direction, i.via, i.coin, amount);
    const fee = await ethFeeWei(RELAY_GAS);
    const midWei = toWei(floorAmount(h1.out, 8));
    if (!midWei || midWei <= fee) throw new Error("Too small: the ETH from step 1 wouldn't cover Ethereum's network fee.");
    const rd = relayLegDirection(i.direction);
    const r = await relayQuote(rd, who, midWei - fee, 100, rd === "to_ton" ? SAMPLE_TON : undefined);
    const relayOut = fromUnits(legs(rd).to, r.outWei);
    if (hasTonStep(i.direction)) {
      // Step 3: STON.fi on the TON that arrives, less the TON kept back for that step's fees.
      const hand = r.outWei - TON_STEP_RESERVE_NANO;
      if (hand < 100_000_000n) throw new Error("Too small: the TON from step 2 wouldn't cover the TON step's fees (swap a little more).");
      const { stonQuote } = await import("@/lib/pockets/ton-usdt.server");
      const usdt = Number(await stonQuote(hand)) / 1e6;
      return { direction: i.direction, via: i.via, coin: i.coin, amountIn: amount, mid: h1.out, ton: relayOut, out: usdt, amountUsd: h1.inputUsd ?? r.inUsd, outUsd: usdt, protocol: h1.protocol, seconds: (h1.seconds ?? 0) + (r.seconds ?? 0) + 120 };
    }
    return { direction: i.direction, via: i.via, coin: i.coin, amountIn: amount, mid: h1.out, ton: null as number | null, out: relayOut, amountUsd: h1.inputUsd ?? r.inUsd, outUsd: r.outUsd, protocol: h1.protocol, seconds: (h1.seconds ?? 0) + (r.seconds ?? 0) + 60 };
  }
  const inWei = toWei(floorAmount(amount, 8));
  if (!inWei) throw new Error("Enter an amount above zero.");
  const r = await relayQuote("from_hype", who, inWei, 100);
  const fee = await ethFeeWei(GAS_ETH_SEND);
  const handWei = r.outWei - fee;
  if (handWei <= 0n) throw new Error("Too small: the ETH from step 1 wouldn't cover Ethereum's network fee.");
  const h2 = await quoteSideHop("from_hype", i.via, i.coin, fromWei(handWei));
  return { direction: i.direction, via: i.via, coin: i.coin, amountIn: amount, mid: fromWei(r.outWei), ton: null as number | null, out: h2.out, amountUsd: r.inUsd, outUsd: null as number | null, protocol: h2.protocol, seconds: (r.seconds ?? 0) + (h2.seconds ?? 0) + 60 };
}

/* ---------------------------------- request ---------------------------------- */

export type HypeChainRequest = HypeChainQuoteInput & { shownOut: number; slippageBps: number };

export async function requestHypeChain(userId: string, tester: boolean, input: HypeChainRequest) {
  const { withPocketSpendLock } = await import("@/lib/set-asides.server");
  return withPocketSpendLock(userId, () => requestUnlocked(userId, tester, input));
}

async function requestUnlocked(userId: string, tester: boolean, input: HypeChainRequest) {
  if (!Number.isInteger(input.slippageBps) || input.slippageBps < 10 || input.slippageBps > 1000) throw new Error("Pick a price protection between 0.1% and 10%.");
  const { loadLink } = await import("@/lib/xchain/send.server");
  const { relayBlocker, nativeBalance } = await import("@/lib/relay/relay.server");
  const link = await loadLink(userId);
  const { data: prof } = await supabaseAdmin.from("profiles").select("telegram_verified").eq("id", userId).maybeSingle();
  const blocker = relayBlocker({ tester, telegramVerified: prof?.telegram_verified === true, needsTon: relayLegDirection(input.direction) === "to_ton", link: link ? { mode: link.mode, hasKey: link.hasKey, pockets: link.pockets as string[] } : null });
  if (blocker) throw new Error(blocker);
  if (hasTonStep(input.direction)) {
    const { stonBlocker } = await import("@/lib/ston/ston.server");
    const sb = stonBlocker(tester, link);
    if (sb) throw new Error(sb);
  }
  const evm = link!.addresses.EVM!.toLowerCase();
  const coin = input.via === "xchain" ? swapCoin(input.coin) : null;
  if (input.via === "xchain" && (!coin || coin.id === "ETH")) throw new Error("Pick a coin.");
  if (input.via === "tsd" && input.coin !== "TSD") throw new Error("Pick a coin.");
  const rp = coin ? receivePocket(coin) : null, sp = coin ? sendSource(coin)?.pocket ?? null : null;
  if (coin && input.direction === "from_hype" && !(rp && link!.addresses[rp])) throw new Error(`Your trading pocket can't hold ${coin.symbol} yet.`);
  if (coin && relayIsSecond(input.direction) && !(sp && link!.addresses[sp])) throw new Error(`Seeds can't send ${coin.symbol} from your pocket yet.`);

  const q = await quoteHypeChain(input);
  if (!(q.out >= input.shownOut * 0.99)) throw new Error(`The price moved more than 1% since you looked (now about ${fmt(q.out)}). Check the new quote and try again.`);

  // Coins set aside for open orders stay put.
  const { legForSwapAsset, legForEvmToken } = await import("@/lib/set-asides");
  const { pocketSpendProblem } = await import("@/lib/set-asides.server");
  if (input.direction === "from_hype") {
    const bal = await nativeBalance("hyperevm", evm);
    if (bal == null) throw new Error("Couldn't read your HYPE balance. Try again in a minute.");
    const { fees, feeNeed } = await import("@/lib/relay/relay.server");
    const hf = await fees("hyperevm");
    if (!hf) throw new Error("Hyperliquid didn't answer. Try again in a minute.");
    const need = toWei(floorAmount(q.amountIn, 8))! + feeNeed(hf.maxFeePerGas);
    if (bal < need) throw new Error(`Not enough HYPE: the swap plus the network fee needs about ${fmt(fromWei(need - bal))} HYPE more. Nothing was sent.`);
    const held = legForEvmToken("hyperevm", null);
    if (held) { const why = await pocketSpendProblem(userId, held, q.amountIn, { address: evm, network: "hyperevm" }); if (why) throw new Error(why); }
  } else if (coin) {
    const held = legForSwapAsset(coin.asset);
    const at = link!.addresses[sendSource(coin)!.pocket]!;
    if (held) { const why = await pocketSpendProblem(userId, held, q.amountIn, { address: at, network: null }); if (why) throw new Error(why); }
  }

  // Three-step chains: min_out guards the Relay step (TON), final_min the STON.fi step (USD₮ on TON).
  const finalMin = hasTonStep(input.direction) ? chainMinimum(input.shownOut, input.slippageBps) : null;
  const min = finalMin != null ? chainMinimum(q.ton!, input.slippageBps) : chainMinimum(input.shownOut, input.slippageBps);
  const { data: id, error } = await supabaseAdmin.rpc("reserve_hype_chain", {
    _row: {
      user_id: userId, link_id: link!.id, direction: input.direction, via: input.via, coin_id: input.coin, protocol: q.protocol ?? "", pocket: evm,
      amount_in: q.amountIn, amount_usd: Math.round((q.amountUsd ?? 0) * 100) / 100, shown_mid: q.mid, shown_out: input.shownOut, min_out: min, slippage_bps: input.slippageBps, final_min: finalMin ?? "",
    } as never,
  });
  if (error || !id) throw new Error(clean(error?.message ?? "Could not start this swap."));
  const chainId = id as string;
  const fromSym = relayIsSecond(input.direction) ? symbolOf(input.coin) : "HYPE";
  const toSym = relayIsSecond(input.direction) ? chainEndSymbol(input.direction) : symbolOf(input.coin);
  const fromAddr = input.direction === "from_hype" ? evm : input.via === "tsd" ? link!.addresses.TXC! : link!.addresses[sendSource(coin!)!.pocket]!;
  try {
    const { requestSendApproval } = await import("@/lib/pocket-send/approvals.server");
    const ap = await requestSendApproval({
      userId, linkId: link!.id, purpose: "hype_chain", refId: chainId, leg: `hype_chain:${input.direction}`, asset: fromSym, amount: q.amountIn,
      from: fromAddr, to: relayLegDirection(input.direction) === "to_ton" ? link!.addresses.TON! : evm,
      what: finalMin != null
        ? `Swap ${fmt(q.amountIn)} ${fromSym} to about ${fmt(input.shownOut)} ${toSym} (at least ${fmt(finalMin)}) in three steps: ${fromSym} → ETH → TON (Relay) → USD₮ on TON (STON.fi). Every step pays your own pocket.`
        : `Swap ${fmt(q.amountIn)} ${fromSym} to about ${fmt(input.shownOut)} ${toSym} (at least ${fmt(min)}) in two steps through ETH and Relay. Every step pays your own pocket.`,
      meta: { direction: input.direction, via: input.via, coin: input.coin },
    });
    await supabaseAdmin.from("hype_chains").update({ approval_id: ap.id, updated_at: new Date().toISOString() }).eq("id", chainId);
    return { id: chainId, approvalExpiresAt: ap.expires_at };
  } catch (e) {
    await supabaseAdmin.from("hype_chains").update({ status: "cancelled", error: (e instanceof Error ? e.message : String(e)).slice(0, 300), updated_at: new Date().toISOString() }).eq("id", chainId);
    throw e;
  }
}

export async function cancelHypeChain(userId: string, id: string) {
  const { data } = await supabaseAdmin.from("hype_chains").update({ status: "cancelled", error: "Cancelled on the Swap page", updated_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", userId).eq("status", "awaiting_approval").select("id");
  if (!data?.length) throw new Error("This swap can't be cancelled any more.");
  const { cancelApprovals } = await import("@/lib/pocket-send/approvals.server");
  await cancelApprovals({ purpose: "hype_chain", refId: id }, "You cancelled this swap on the Swap page.");
}

/* ---------------------------------- advance ---------------------------------- */

const OPEN = "(done,failed,kept_mid,declined,expired,cancelled)";

async function claim(id: string): Promise<Row | null> {
  const now = new Date();
  const { data } = await supabaseAdmin.from("hype_chains").update({ working_until: new Date(now.getTime() + 120_000).toISOString() })
    .eq("id", id).not("status", "in", OPEN).or(`working_until.is.null,working_until.lt.${now.toISOString()}`).select("*").maybeSingle();
  return (data as Row | null) ?? null;
}
async function save(id: string, patch: Partial<Row>) {
  const { error } = await supabaseAdmin.from("hype_chains").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`Could not record the swap: ${error.message}`);
}
const move = (status: HypeChainStatus, extra: Partial<Row> = {}): Partial<Row> => ({ status, step_at: new Date().toISOString(), error: null, ...extra });
async function notify(r: Row, text: string) {
  try {
    const { notifyUser } = await import("@/lib/telegram.server");
    await notifyUser(r.user_id, "notify_settlement", text);
  } catch (e) { console.error("hype chain alert failed", e); }
}

async function linkStillSame(r: Row) {
  const { loadLink } = await import("@/lib/xchain/send.server");
  const link = await loadLink(r.user_id);
  if (!link || link.id !== r.link_id || link.mode !== "access" || !link.hasKey) return null;
  if ((link.addresses.EVM ?? "").toLowerCase() !== r.pocket) return null;
  return link;
}

type Hop = "relay" | "tsd" | "xchain";
const hopKind = (r: Row, leg: 1 | 2): Hop => (relayIsSecond(r.direction as HypeChainDirection) === (leg === 2) ? "relay" : (r.via as HypeChainVia));

/** A step this chain already started since the step began (never start a second one). */
async function stepSince(r: Row, hop: Hop): Promise<string | null> {
  const table = hop === "relay" ? "relay_swaps" : hop === "tsd" ? "tsd_routes" : "swap_sends";
  const { data } = await supabaseAdmin.from(table).select("id").eq("user_id", r.user_id).eq("parent_id", r.id).gte("created_at", r.step_at)
    .order("created_at", { ascending: false }).limit(1);
  return (data?.[0] as { id: string } | undefined)?.id ?? null;
}

/** Step 3 this chain already started since the step began (never start a second one). */
async function tonStepSince(r: Row): Promise<string | null> {
  const { data } = await supabaseAdmin.from("ton_swaps").select("id").eq("user_id", r.user_id).eq("parent_id", r.id).gte("created_at", r.step_at)
    .order("created_at", { ascending: false }).limit(1);
  return (data?.[0] as { id: string } | undefined)?.id ?? null;
}
const tonUnitsOf = (ton: number): bigint | null => (Number.isFinite(ton) && ton > 0 ? BigInt(Math.floor(ton * 1e9)) : null);
const nanoToTon = (n: bigint) => `${n / 1_000_000_000n}.${(n % 1_000_000_000n).toString().padStart(9, "0")}`;
async function tonNano(address: string): Promise<bigint | null> {
  const { fetchExtraBalance } = await import("@/lib/pockets/io.server");
  const b = await fetchExtraBalance("TON", address).catch(() => null);
  return b == null ? null : tonUnitsOf(b) ?? 0n;
}

type Follow = { state: "wait" | "done" | "stopped"; paid: number | null; note?: string };

async function paidOut(protocol: Protocol, txid: string, asset: string): Promise<number | null> {
  const { protocolTxStatus } = await import("@/lib/xchain/router.server");
  const { thorTxId } = await import("@/lib/xchain/send-rules");
  const s = (await protocolTxStatus(protocol, thorTxId(txid))) as { out_txs?: Array<{ memo?: string; coins?: Array<{ asset?: string; amount?: string }> }> } | null;
  const want = asset.toUpperCase();
  const c = s?.out_txs?.find((o) => /^OUT/i.test(o.memo ?? ""))?.coins?.find((x) => (x.asset ?? "").toUpperCase() === want);
  const n = c?.amount ? Number(c.amount) / 1e8 : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function follow(r: Row, hop: Hop, id: string, outAsset: string): Promise<Follow> {
  if (hop === "relay") {
    const { advanceRelaySwap } = await import("@/lib/relay/relay.server");
    await advanceRelaySwap(id).catch(() => undefined);
    const { data: s } = await supabaseAdmin.from("relay_swaps").select("status, amount_out, error").eq("id", id).maybeSingle();
    if (!s) return { state: "wait", paid: null };
    if (s.status === "done") return { state: "done", paid: s.amount_out == null ? null : Number(s.amount_out) };
    if (["refunded", "failed", "declined", "expired", "cancelled"].includes(s.status)) return { state: "stopped", paid: null, note: s.error ?? `Relay step ${s.status}.` };
    return { state: "wait", paid: null };
  }
  if (hop === "tsd") {
    const { advanceRoute } = await import("@/lib/xchain/tsd-route.server");
    await advanceRoute(id).catch(() => undefined);
    const { data: t } = await supabaseAdmin.from("tsd_routes").select("stage, amount_out, error").eq("id", id).maybeSingle();
    if (!t) return { state: "wait", paid: null };
    if (t.stage === "done") return { state: "done", paid: t.amount_out == null ? null : Number(t.amount_out) };
    if (["refunded", "kept_usdc", "failed"].includes(t.stage)) return { state: "stopped", paid: null, note: t.error ?? `TSD step ${t.stage}.` };
    return { state: "wait", paid: null };
  }
  const { refreshSwapSends } = await import("@/lib/xchain/send.server");
  await refreshSwapSends(r.user_id).catch(() => undefined);
  const { data: s } = await supabaseAdmin.from("swap_sends").select("status, txid, expected_out, protocol, error").eq("id", id).maybeSingle();
  if (!s) return { state: "wait", paid: null };
  if (s.status === "done") {
    const p: Protocol = s.protocol === "maya" ? "maya" : "thorchain";
    return { state: "done", paid: s.txid ? await paidOut(p, s.txid, outAsset).catch(() => null) : null };
  }
  if (s.status === "refunded" || s.status === "failed") return { state: "stopped", paid: null, note: s.error ?? `Swap step ${s.status}.` };
  return { state: "wait", paid: null };
}

/** Start a THORChain/Maya or TSD step (own pocket only). Returns the child id, or a reason it didn't go. */
async function startSideHop(r: Row, leg: 1 | 2, amount: number, shownOut: number, tolerance: number): Promise<{ id: string } | { stop: string }> {
  const earlier = await stepSince(r, hopKind(r, leg));
  if (earlier) return { id: earlier };
  const toHype = relayIsSecond(r.direction as HypeChainDirection);
  try {
    if (r.via === "tsd") {
      const { startTsdRoute } = await import("@/lib/xchain/tsd-route.server");
      const row = await startTsdRoute(r.user_id, true, { direction: toHype ? "buy" : "sell", coin: "ETH", amount: floorAmount(amount, 8), shownOut }, { waitForFirstSend: false, parentId: r.id });
      if (!row) throw new Error("The TSD step didn't start.");
      return { id: row.id };
    }
    const { loadLink, sendSwapFromPocket, PriceMovedError, RouteUnavailableError } = await import("@/lib/xchain/send.server");
    const link = await loadLink(r.user_id);
    const coin = swapCoin(r.coin_id)!;
    const from = toHype ? coin : eth(), to = toHype ? eth() : coin;
    const destination = toHype ? link!.addresses.EVM! : link!.addresses[receivePocket(coin)!]!;
    const chosen: Protocol = r.protocol === "maya" ? "maya" : "thorchain";
    const order = [chosen, ...from.protocols.filter((p) => p !== chosen && to.protocols.includes(p) && sendSource(from, p) !== null)] as Protocol[];
    let last = "No swap network can take this step right now.";
    for (const protocol of order) {
      try {
        const sent = await sendSwapFromPocket(r.user_id, false, { from: from.id, to: to.id, amount: floorAmount(amount, 8), destination, shownOut, protocol }, { routeId: r.id, tolerance });
        if ("needsApproval" in sent && sent.needsApproval) throw new Error("A chained swap pays only your own pocket.");
        return { id: (sent as { id: string }).id };
      } catch (e) {
        if (e instanceof PriceMovedError) return { stop: `The price moved before step ${leg}.` };
        if (e instanceof RouteUnavailableError) { last = e.message; continue; }
        const after = await stepSince(r, "xchain");
        if (after) return { id: after };
        throw e;
      }
    }
    return { stop: last };
  } catch (e) {
    const after = await stepSince(r, hopKind(r, leg));
    if (after) return { id: after };
    return { stop: e instanceof Error ? e.message : String(e) };
  }
}

async function step(r: Row): Promise<boolean> {
  const status = r.status as HypeChainStatus;
  const go = async (patch: Partial<Row>) => { await save(r.id, patch); return patch.status !== undefined && patch.status !== status; };
  const toHype = relayIsSecond(r.direction as HypeChainDirection);
  const endSym = chainEndSymbol(r.direction as HypeChainDirection);
  const sym = symbolOf(r.coin_id);
  const ethIn = "Your ETH is in your trading pocket on Ethereum; swap it on Seeds → Swap when you like.";

  switch (status) {
    case "awaiting_approval": {
      if (!r.approval_id) return go(minutesSince(r.created_at) > 20 ? move("expired") : {});
      const { data: ap } = await supabaseAdmin.from("send_approvals").select("status, expires_at, from_address, amount").eq("id", r.approval_id).maybeSingle();
      if (!ap) return go(move("cancelled", { error: "The approval request is missing." }));
      if (ap.status === "declined") return go(move("declined", { error: "Declined in Telegram. Nothing was sent." }));
      if (ap.status === "cancelled") return go(move("cancelled", { error: "The approval request was closed. Nothing was sent." }));
      if (ap.status === "expired" || (ap.status === "pending" && Date.parse(ap.expires_at) <= Date.now())) return go(move("expired", { error: "Not approved in time. Nothing was sent." }));
      if (ap.status !== "approved") return go({});
      const still = await linkStillSame(r);
      if (!still) return go(move("cancelled", { error: "Your wallet link changed since this request. Nothing was sent." }));
      const payTo = relayLegDirection(r.direction as HypeChainDirection) === "to_ton" ? still.addresses.TON : r.pocket;
      if (!payTo) return go(move("cancelled", { error: "Your TON pocket is no longer on your link. Nothing was sent." }));
      const { spendApproval } = await import("@/lib/pocket-send/approvals.server");
      await spendApproval({ purpose: "hype_chain", id: r.approval_id, leg: `hype_chain:${r.direction}`, userId: r.user_id, linkId: r.link_id, amount: Number(r.amount_in), from: ap.from_address, to: payTo });
      return go(move("approved"));
    }

    case "approved": {
      if (!(await linkStillSame(r))) return go(move("failed", { error: "Your trading pocket was unlinked, so Seeds stopped this swap. Nothing was sent." }));
      if (r.leg1_id) return go(move("leg1"));
      // Note the ETH already in the pocket once, so step 2 only hands on what arrived.
      if (r.eth_baseline_wei == null) {
        const { nativeBalance } = await import("@/lib/relay/relay.server");
        const before = await nativeBalance("ethereum", r.pocket).catch(() => null);
        if (before == null) return go({ error: "Couldn't read your ETH balance before step 1; retrying." });
        await save(r.id, { eth_baseline_wei: before.toString() });
        r = { ...r, eth_baseline_wei: before.toString() };
      }
      if (!toHype) {
        const earlier = await stepSince(r, "relay");
        if (earlier) return go(move("leg1", { leg1_id: earlier }));
        const wei = toWei(floorAmount(Number(r.amount_in), 8))!;
        const shownWei = toWei(floorAmount(Number(r.shown_mid), 8))!;
        const { startRelayLeg } = await import("@/lib/relay/relay.server");
        try {
          const id = await startRelayLeg(r.id, { direction: "from_hype" as RelayDirection, pocket: r.pocket, amountWei: wei, shownOut: Number(r.shown_mid), minOutWei: agreedMinWei(shownWei, 200), amountUsd: Number(r.amount_usd) });
          return go(move("leg1", { leg1_id: id }));
        } catch (e) {
          const after = await stepSince(r, "relay");
          if (after) return go(move("leg1", { leg1_id: after }));
          return go(move("failed", { error: `${e instanceof Error ? e.message : String(e)} Nothing was sent.`.slice(0, 300) }));
        }
      }
      const res = await startSideHop(r, 1, Number(r.amount_in), Number(r.shown_mid), 0.02);
      if ("stop" in res) return go(move("failed", { error: `${res.stop} Nothing was sent.`.slice(0, 300) }));
      return go(move("leg1", { leg1_id: res.id }));
    }

    case "leg1": {
      const f = await follow(r, hopKind(r, 1), r.leg1_id!, eth().asset);
      if (f.state === "wait") return go(minutesSince(r.step_at) > HOP_STUCK_MINUTES && !r.error ? { error: "Step 1 is taking longer than usual; the team will check. Nothing is re-sent." } : {});
      if (f.state === "stopped") {
        void notify(r, `Your ${toHype ? sym : "HYPE"} → ${toHype ? endSym : sym} swap stopped at step 1: ${f.note}`);
        return go(move("failed", { error: `Step 1 stopped: ${f.note}`.slice(0, 300) }));
      }
      return go(move("mid", { mid_amount: f.paid ?? null }));
    }

    case "mid": {
      if (!(await linkStillSame(r))) return go(move("kept_mid", { error: `Your trading pocket was unlinked, so Seeds stopped before step 2. ${ethIn}` }));
      if (r.leg2_id) return go(move("leg2"));
      const earlier = await stepSince(r, hopKind(r, 2));
      if (earlier) return go(move("leg2", { leg2_id: earlier }));
      const { nativeBalance } = await import("@/lib/relay/relay.server");
      const bal = await nativeBalance("ethereum", r.pocket).catch(() => null);
      const reported = r.mid_amount == null ? null : toWei(floorAmount(Number(r.mid_amount), 8));
      const fee = await ethFeeWei(toHype ? RELAY_GAS : GAS_ETH_SEND).catch(() => null);
      if (bal == null || fee == null) return go({ error: "Ethereum didn't answer; retrying." });
      const hand = ethToHandOn(reported, bal, r.eth_baseline_wei == null ? null : BigInt(r.eth_baseline_wei), fee);
      if (hand == null) {
        if (minutesSince(r.step_at) < 30) return go({ error: "Waiting for the ETH from step 1 to show in your pocket." });
        return go(move("kept_mid", { error: `The ETH from step 1 didn't show up in your pocket in time. ${ethIn}` }));
      }
      const handEth = fromWei(hand);
      let fresh: number;
      try {
        if (toHype) {
          const { relayQuote } = await import("@/lib/relay/relay.server");
          const rd = relayLegDirection(r.direction as HypeChainDirection);
          const tonTo = rd === "to_ton" ? (await linkStillSame(r))?.addresses.TON : undefined;
          if (rd === "to_ton" && !tonTo) return go(move("kept_mid", { error: `Your TON pocket is no longer on your link. ${ethIn}` }));
          fresh = fromUnits(legs(rd).to, (await relayQuote(rd, r.pocket, hand, r.slippage_bps, tonTo ?? undefined)).outWei);
        } else {
          fresh = (await quoteSideHop("from_hype", r.via as HypeChainVia, r.coin_id, handEth)).out;
        }
      } catch (e) {
        if (minutesSince(r.step_at) > 30) return go(move("kept_mid", { error: `No usable price for step 2 for 30 minutes. ${ethIn}` }));
        return go({ error: `${e instanceof Error ? e.message : String(e)}; retrying.`.slice(0, 300) });
      }
      if (!secondHopOk(fresh, Number(r.min_out))) {
        void notify(r, `Seeds stopped your swap before step 2: the price fell below the minimum you agreed to (${fmt(Number(r.min_out))}). ${ethIn}`);
        return go(move("kept_mid", { mid_handed: null, error: `The price fell below your minimum before step 2. ${ethIn}` }));
      }
      if (toHype && hasTonStep(r.direction as HypeChainDirection) && r.ton_baseline_nano == null) {
        // Note the TON already in the pocket once, so step 3 only swaps the TON that arrived.
        const tonAt = (await linkStillSame(r))?.addresses.TON;
        const before = tonAt ? await tonNano(tonAt) : null;
        if (before == null) return go({ error: "Couldn't read your TON balance before step 2; retrying." });
        await save(r.id, { ton_baseline_nano: before.toString() });
        r = { ...r, ton_baseline_nano: before.toString() };
      }
      if (toHype) {
        const { startRelayLeg } = await import("@/lib/relay/relay.server");
        try {
          const rd = relayLegDirection(r.direction as HypeChainDirection);
          const tonTo = rd === "to_ton" ? (await linkStillSame(r))?.addresses.TON : undefined;
          const id = await startRelayLeg(r.id, { direction: rd, pocket: r.pocket, amountWei: hand, shownOut: fresh, minOutWei: toUnits(legs(rd).to, floorAmount(Number(r.min_out), 8))!, amountUsd: Number(r.amount_usd), ...(tonTo ? { recipient: tonTo } : {}) });
          return go(move("leg2", { leg2_id: id, mid_handed: handEth }));
        } catch (e) {
          const after = await stepSince(r, "relay");
          if (after) return go(move("leg2", { leg2_id: after, mid_handed: handEth }));
          return go(move("kept_mid", { error: `${e instanceof Error ? e.message : String(e)} ${ethIn}`.slice(0, 300) }));
        }
      }
      const res = await startSideHop(r, 2, handEth, fresh, 0.01);
      if ("stop" in res) return go(move("kept_mid", { error: `${res.stop} ${ethIn}`.slice(0, 300) }));
      return go(move("leg2", { leg2_id: res.id, mid_handed: handEth }));
    }

    case "leg2": {
      const coin = swapCoin(r.coin_id);
      const f = await follow(r, hopKind(r, 2), r.leg2_id!, coin?.asset ?? "");
      if (f.state === "wait") return go(minutesSince(r.step_at) > HOP_STUCK_MINUTES && !r.error ? { error: "Step 2 is taking longer than usual; the team will check. Nothing is re-sent." } : {});
      if (f.state === "stopped") {
        void notify(r, `Step 2 of your swap didn't complete (${f.note}). ${ethIn}`);
        return go(move("kept_mid", { error: `Step 2 stopped: ${f.note} ${ethIn}`.slice(0, 300) }));
      }
      if (hasTonStep(r.direction as HypeChainDirection)) return go(move("mid2", { ton_amount: f.paid ?? null }));
      void notify(r, `Swap done: ${fmt(Number(r.amount_in))} ${toHype ? sym : "HYPE"} → ${f.paid != null ? fmt(f.paid) : "about " + fmt(Number(r.shown_out))} ${toHype ? endSym : sym}, in your own pocket.`);
      return go(move("done", { amount_out: f.paid }));
    }
    case "mid2": {
      const tonIn = "Your TON is in your TON pocket; swap it on Seeds → Swap when you like.";
      if (r.leg3_id) return go(move("leg3"));
      const earlier = await tonStepSince(r);
      if (earlier) return go(move("leg3", { leg3_id: earlier }));
      const link = await linkStillSame(r);
      const tonAt = link?.addresses.TON;
      if (!link || !tonAt) return go(move("kept_mid", { error: `Your trading pocket was unlinked, so Seeds stopped before step 3. ${tonIn}` }));
      const bal = await tonNano(tonAt);
      if (bal == null) return go({ error: "TON didn't answer; retrying." });
      const reported = r.ton_amount == null ? null : tonUnitsOf(Number(r.ton_amount));
      const hand = tonToHandOn(reported, bal, r.ton_baseline_nano == null ? null : BigInt(r.ton_baseline_nano));
      if (hand == null) {
        if (minutesSince(r.step_at) < 30) return go({ error: "Waiting for the TON from step 2 to show in your pocket." });
        return go(move("kept_mid", { error: `The TON from step 2 didn't show up in your pocket in time, or was too little for the last step. ${tonIn}` }));
      }
      const floor = BigInt(Math.floor(Number(r.final_min) * 1e6));
      let fresh: bigint;
      try {
        const { stonQuote } = await import("@/lib/pockets/ton-usdt.server");
        fresh = await stonQuote(hand);
      } catch (e) {
        if (minutesSince(r.step_at) > 30) return go(move("kept_mid", { error: `No usable price for step 3 for 30 minutes. ${tonIn}` }));
        return go({ error: `${e instanceof Error ? e.message : String(e)}; retrying.`.slice(0, 300) });
      }
      if (fresh < floor) {
        void notify(r, `Seeds stopped your swap before step 3: the price fell below the minimum you agreed to (${fmt(Number(r.final_min))} USD₮). ${tonIn}`);
        return go(move("kept_mid", { error: `The price fell below your minimum before step 3. ${tonIn}` }));
      }
      try {
        const { startTonToUsdt } = await import("@/lib/ston/ston.server");
        // Pass the member's live tester status so step 3 meets the same swap caps as a direct TON swap (audit TC1).
        const { isTesterUser } = await import("@/lib/ai/execute.server");
        const res = await startTonToUsdt(r.user_id, await isTesterUser(r.user_id), { amount: nanoToTon(hand), shownOutUnits: fresh.toString() }, { parentId: r.id, floorUnits: floor });
        return go(move("leg3", { leg3_id: res.id }));
      } catch (e) {
        const after = await tonStepSince(r);
        if (after) return go(move("leg3", { leg3_id: after }));
        return go(move("kept_mid", { error: `${e instanceof Error ? e.message : String(e)} ${tonIn}`.slice(0, 300) }));
      }
    }

    case "leg3": {
      const tonIn = "Your TON is in your TON pocket; swap it on Seeds → Swap when you like.";
      const { data: t } = await supabaseAdmin.from("ton_swaps").select("id, pocket, status, txid, min_out_units, usdt_baseline, send_meta, created_at, updated_at, received_units, error").eq("id", r.leg3_id!).maybeSingle();
      if (!t) return go({});
      const { checkTonSwap } = await import("@/lib/ston/ston.server");
      const st = await checkTonSwap({ ...t, min_out_units: String(t.min_out_units), usdt_baseline: String(t.usdt_baseline) } as never).catch(() => t.status);
      if (st === "done") {
        const { data: d } = await supabaseAdmin.from("ton_swaps").select("received_units").eq("id", t.id).maybeSingle();
        const got = d?.received_units == null ? null : Number(d.received_units) / 1e6;
        void notify(r, `Swap done: ${fmt(Number(r.amount_in))} ${sym} → ${got != null ? fmt(got) : "about " + fmt(Number(r.shown_out))} USD₮ on TON, in your own pocket.`);
        return go(move("done", { amount_out: got }));
      }
      if (st === "failed") {
        void notify(r, `Step 3 of your swap didn't go out (${t.error ?? "stopped"}). ${tonIn}`);
        return go(move("kept_mid", { error: `Step 3 stopped: ${t.error ?? "nothing was sent"}. ${tonIn}`.slice(0, 300) }));
      }
      return go(minutesSince(r.step_at) > HOP_STUCK_MINUTES && !r.error ? { error: "Step 3 is taking longer than usual; the team will check. Nothing is re-sent." } : {});
    }
    default:
      return go({});
  }
}

export async function advanceHypeChain(id: string): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const r = await claim(id);
    if (!r) return;
    let changed = false;
    try {
      changed = await step(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("hype chain step failed", id, r.status, msg);
      await save(id, { error: msg.slice(0, 300) }).catch(() => undefined);
    } finally {
      await supabaseAdmin.from("hype_chains").update({ working_until: null }).eq("id", id);
    }
    if (!changed) return;
  }
}

export async function advanceOpenHypeChains(): Promise<{ checked: number }> {
  const { data } = await supabaseAdmin.from("hype_chains").select("id").not("status", "in", OPEN).order("created_at", { ascending: true }).limit(25);
  for (const r of data ?? []) await advanceHypeChain(r.id).catch((e) => console.error("hype chain advance failed", r.id, e));
  return { checked: data?.length ?? 0 };
}

export async function listHypeChains(userId: string) {
  const { data: open } = await supabaseAdmin.from("hype_chains").select("id").eq("user_id", userId).not("status", "in", OPEN).limit(3);
  for (const r of open ?? []) await advanceHypeChain(r.id).catch(() => undefined);
  const { data, error } = await supabaseAdmin.from("hype_chains")
    .select("id, direction, via, coin_id, amount_in, shown_out, amount_out, status, error, created_at, ton_amount")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  const logs = await chainLogs(userId, (data ?? []).map((r) => r.id)).catch(() => new Map<string, ChainLogEntry[]>());
  return (data ?? []).map((r) => {
    const sym = symbolOf(r.coin_id);
    const d = r.direction as HypeChainDirection;
    return {
      ...r, amount_in: Number(r.amount_in), shown_out: Number(r.shown_out), amount_out: r.amount_out == null ? null : Number(r.amount_out),
      symbolIn: relayIsSecond(d) ? sym : "HYPE", symbolOut: relayIsSecond(d) ? chainEndSymbol(d) : sym,
      log: logs.get(r.id) ?? [], label: chainStatusLabel(r.status as HypeChainStatus, r.direction as HypeChainDirection, r.ton_amount != null), steps: chainSteps(d, r.via as HypeChainVia, sym), terminal: isHypeChainTerminal(r.status),
    };
  });
}

/* ---------------------------------- step log ---------------------------------- */

export type ChainLogEntry = { at: string; text: string; txid: string | null; url: string | null };
const TXC_TX = "https://mempool.texitcoin.org/tx/", ETH_TX = "https://etherscan.io/tx/", THOR_TX = "https://viewblock.io/thorchain/tx/";
/** TSD Bridge's public order page: TX- plus the first 8 characters of the order id. */
export const tsdBridgeOrderUrl = (orderId: string) => `https://tsd.honest.money/swap/TX-${orderId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

/** The member's own step records for these chains, oldest first: what happened, its transaction and where to see it. */
async function chainLogs(userId: string, ids: string[]): Promise<Map<string, ChainLogEntry[]>> {
  const out = new Map<string, ChainLogEntry[]>();
  if (!ids.length) return out;
  const add = (id: string | null, e: ChainLogEntry) => { if (!id) return; const l = out.get(id) ?? []; l.push(e); out.set(id, l); };
  const [t, x, rl, tn] = await Promise.all([
    supabaseAdmin.from("tsd_routes").select("parent_id, created_at, updated_at, direction, stage, bridge_order_id, tsd_txid, usdc_txid, bridge_out_txid, swap_send_id").eq("user_id", userId).in("parent_id", ids),
    supabaseAdmin.from("swap_sends").select("parent_id, created_at, from_asset, to_asset, txid, out_txid, status").eq("user_id", userId).in("parent_id", ids),
    supabaseAdmin.from("relay_swaps").select("parent_id, created_at, updated_at, direction, deposit_txid, out_txid, status, amount_in, shown_out, amount_out, request_id").eq("user_id", userId).in("parent_id", ids),
    supabaseAdmin.from("ton_swaps").select("parent_id, created_at, updated_at, txid, status").eq("user_id", userId).in("parent_id", ids),
  ]);
  const legIds = (t.data ?? []).map((r) => r.swap_send_id).filter(Boolean) as string[];
  const legs = legIds.length ? (await supabaseAdmin.from("swap_sends").select("id, txid, status").eq("user_id", userId).in("id", legIds)).data ?? [] : [];
  for (const r of t.data ?? []) {
    if (r.bridge_order_id) add(r.parent_id, { at: r.created_at, text: "TSD Bridge order", txid: null, url: tsdBridgeOrderUrl(r.bridge_order_id) });
    if (r.tsd_txid) add(r.parent_id, { at: r.created_at, text: "Sent TSD to TSD Bridge", txid: r.tsd_txid, url: TXC_TX + r.tsd_txid });
    if (r.usdc_txid) add(r.parent_id, { at: r.updated_at, text: "USDC sent", txid: r.usdc_txid, url: ETH_TX + r.usdc_txid });
    if (r.bridge_out_txid) add(r.parent_id, { at: r.updated_at, text: "TSD Bridge paid out", txid: r.bridge_out_txid, url: /^0x/.test(r.bridge_out_txid) ? ETH_TX + r.bridge_out_txid : null });
    const leg = legs.find((l) => l.id === r.swap_send_id);
    if (leg?.txid) add(r.parent_id, { at: r.updated_at, text: "USDC → ETH on THORChain/Maya", txid: leg.txid, url: THOR_TX + leg.txid.replace(/^0x/, "") });
    if (r.stage === "done") add(r.parent_id, { at: r.updated_at, text: "ETH arrived in your pocket", txid: null, url: null });
  }
  for (const r of x.data ?? []) {
    if (r.txid) add(r.parent_id, { at: r.created_at, text: `Sent ${r.from_asset} → ${r.to_asset} on THORChain/Maya`, txid: r.txid, url: THOR_TX + r.txid.replace(/^0x/, "") });
    if (r.out_txid) add(r.parent_id, { at: r.created_at, text: "Payout received", txid: r.out_txid, url: null });
  }
  for (const r of rl.data ?? []) {
    const toTon = r.direction === "to_ton";
    const outSym = toTon ? "TON" : r.direction === "to_hype" ? "HYPE" : "ETH";
    const inSym = r.direction === "from_hype" ? "HYPE" : "ETH";
    const num = (v: unknown) => (v == null ? null : Number(v));
    if (r.request_id) add(r.parent_id, { at: r.created_at, text: `Relay order · expecting ≈ ${num(r.shown_out) ?? "?"} ${outSym}`, txid: null, url: r.deposit_txid ? `https://relay.link/transaction/${r.deposit_txid}` : null });
    if (r.deposit_txid) add(r.parent_id, { at: r.created_at, text: `Sent ${num(r.amount_in) ?? ""} ${inSym} to Relay`.replace("  ", " "), txid: r.deposit_txid, url: (inSym === "HYPE" ? "https://hyperevmscan.io/tx/" : ETH_TX) + r.deposit_txid });
    if (r.out_txid) add(r.parent_id, { at: r.updated_at, text: `Relay paid out${num(r.amount_out) != null ? ` ${num(r.amount_out)} ${outSym}` : ""}${toTon ? " to your TON pocket" : ""}`, txid: r.out_txid, url: toTon ? `https://tonviewer.com/transaction/${r.out_txid}` : outSym === "HYPE" ? `https://hyperevmscan.io/tx/${r.out_txid}` : ETH_TX + r.out_txid });
    if (r.status === "done") add(r.parent_id, { at: r.updated_at, text: `Relay step done — ${outSym} arrived`, txid: null, url: null });
    else if (r.deposit_txid && !r.out_txid) add(r.parent_id, { at: r.updated_at, text: `Waiting for Relay to pay out ${outSym} (usually 1–5 minutes)`, txid: null, url: null });
  }
  for (const r of tn.data ?? []) {
    if (r.txid) add(r.parent_id, { at: r.created_at, text: "Sent TON to STON.fi", txid: r.txid, url: `https://tonviewer.com/transaction/${r.txid}` });
    if (r.status === "done") add(r.parent_id, { at: r.updated_at, text: "USD₮ arrived in your TON pocket", txid: null, url: null });
  }
  for (const l of out.values()) l.sort((a, b) => a.at.localeCompare(b.at));
  return out;
}
