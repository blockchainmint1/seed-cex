/**
 * TSD routes — server orchestrator. See tsd-route.ts for the shape and the rules.
 *
 * Every step is resumable and runs at most once:
 *  - a worker claims the route row (working_until compare-and-set) before acting;
 *  - every transaction id is stored before broadcast, and a step with a stored id is
 *    never signed again — it is only checked;
 *  - TSD Bridge answers are validated (payout = member's own pocket, amount, fee) before
 *    any coin is sent to the bridge;
 *  - the swap leg (THORChain or Maya, whichever quoted best; the other is the fallback
 *    when the chosen one can't take it) goes through sendSwapFromPocket (fresh quote,
 *    two-server vault checks, reserve_swap_send caps), with drift allowed only up to legTolerance.
 * The cron job (/api/public/jobs/tsd-routes) and the Swap page both call advanceRoute.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { PROTOCOL_LABEL, swapCoin, type Protocol, type SwapCoin } from "./assets";
import { gasWalletConfigured } from "./gas.server";
import { toBaseUnits } from "./safety";
import { landsOutsideHmeWallet, receivePocket, requoteOk, sendSource, SWAP_LIMITS } from "./send-rules";
import {
  afterBridgeFee, BRIDGE_USDC_CONTRACT, BRIDGE_USDC_ID, bridgeProgress, gasNeedWei, gasPreflight, isTerminal, legPriceOk, mintOrderProblem,
  GAS_SWAP_LEG, GAS_USDC_TRANSFER, legProtocols, pickLeg, redeemOrderProblem, routeBlocker, routeGasUnits, TSD_ROUTE, type RouteDirection, type RouteStage,
} from "./tsd-route";

type Row = Database["public"]["Tables"]["tsd_routes"]["Row"];

const ETH = "ethereum" as const;
/** Rough TSD Bridge leg time: TEXITcoin confirmation + Ethereum release (estimate, not a promise). */
const BRIDGE_SECONDS = 15 * 60;

const usdc = () => swapCoin(BRIDGE_USDC_ID)!;
const fmt = (n: number, d = 6) => Number(n.toFixed(d)).toString();
const clean = (m: string) => m.replace(/^.*?ERROR:\s*/i, "").trim();

/**
 * What this route's Ethereum leg will cost, and what the pocket holds toward it.
 * Pass no address for a public quote (price only, no balance).
 */
async function gasState(evmAddress: string | null, units: bigint): Promise<{ needWei: bigint; haveWei: bigint | null; priceUsd: number | null }> {
  if (units === 0n) return { needWei: 0n, haveWei: null, priceUsd: null };
  const { evmRpc, suggestFees } = await import("@/lib/evm.server");
  const { ethPriceUsd } = await import("./gas.server");
  const [fees, balHex, priceUsd] = await Promise.all([
    suggestFees(ETH),
    evmAddress ? evmRpc<string>(ETH, "eth_getBalance", [evmAddress, "latest"]) : Promise.resolve(null),
    ethPriceUsd(),
  ]);
  if (!fees) return { needWei: 0n, haveWei: balHex ? BigInt(balHex) : null, priceUsd };
  return { needWei: gasNeedWei(units, fees.maxFeePerGas), haveWei: balHex ? BigInt(balHex) : null, priceUsd };
}

/* ---------------------------------- quote ---------------------------------- */

export type TsdRouteQuote = {
  direction: RouteDirection;
  coin: string;
  ok: boolean;
  error: string | null;
  amountIn: number;
  /** USDC that passes through the member's EVM pocket. */
  usdc: number;
  /** What lands in the member's pocket at the end (coin for buy, TSD for sell). */
  out: number;
  outUsd: number | null;
  minOut: number | null;
  amountUsd: number | null;
  bridgeFeeBps: number;
  swapFeeUsd: number | null;
  seconds: number | null;
  /** Seeds' gas wallet is set up, so members need no ETH for the Ethereum network fee. */
  gasCovered: boolean;
  /** ETH the route's Ethereum leg will cost, and what it is worth, when the member pays it. */
  gasEth: number | null;
  gasUsd: number | null;
  /** Swap network for the coin leg (null for TSD <-> USDC, which is the bridge alone). */
  protocol: Protocol | null;
  /** What the other network offered, for comparison (same units as out / usdc). */
  alt: { protocol: Protocol; out: number } | null;
};

/** Quote the coin leg on every network that can carry it; best first. */
async function legQuotes(direction: RouteDirection, coin: SwapCoin, units: bigint) {
  const { protocolQuote } = await import("./router.server");
  const ps = legProtocols(direction, coin, usdc());
  const from = direction === "buy" ? usdc() : coin;
  const to = direction === "buy" ? coin : usdc();
  const all = await Promise.all(ps.map(async (p) => ({ p, ...(await protocolQuote(p, from, to, units, null)) })));
  const best = pickLeg(all.map((x) => ({ protocol: x.p, ok: x.route.ok, expectedOut: x.route.expectedOut, x })));
  const alt = best ? all.find((x) => x.p !== best.protocol && x.route.ok) : undefined;
  return { best: best?.x ?? null, alt: alt ? { protocol: alt.p, out: alt.route.expectedOut } : null, first: all[0] ?? null };
}

export async function quoteTsdRoute(direction: RouteDirection, coin: SwapCoin, amountStr: string): Promise<TsdRouteQuote> {
  const amount = Number(amountStr);
  const base: TsdRouteQuote = {
    direction, coin: coin.id, ok: false, error: null, amountIn: amount, usdc: 0, out: 0, outUsd: null, minOut: null,
    amountUsd: null, bridgeFeeBps: 0, swapFeeUsd: null, seconds: null, gasCovered: false, gasEth: null, gasUsd: null,
    protocol: null, alt: null,
  };
  if (!(amount > 0) || toBaseUnits(amountStr) == null) return { ...base, error: "Enter an amount with at most 8 decimal places." };
  const { bridgeSettings, tsdBridgeConfigured } = await import("./tsd-bridge.server");
  if (!tsdBridgeConfigured()) return { ...base, error: "TSD Bridge isn't connected." };
  const [s, gasCovered] = await Promise.all([bridgeSettings(), gasWalletConfigured()]);
  base.gasCovered = gasCovered;
  const gas = await gasState(null, routeGasUnits(direction, coin));
  base.gasEth = gas.needWei > 0n ? Number(gas.needWei) / 1e18 : null;
  base.gasUsd = gas.needWei > 0n && gas.priceUsd != null ? (Number(gas.needWei) / 1e18) * gas.priceUsd : null;
  if (!s.live) return { ...base, error: "TSD Bridge is paused right now." };

  if (direction === "buy") {
    if (amount < s.minAmount) return { ...base, error: `TSD Bridge's minimum is ${s.minAmount} TSD.` };
    if (s.maxAmount && amount > s.maxAmount) return { ...base, error: `TSD Bridge's maximum is ${s.maxAmount} TSD.` };
    const usdcOut = afterBridgeFee(amount, s.redeemFeeBps);
    const q = { ...base, bridgeFeeBps: s.redeemFeeBps, usdc: usdcOut, amountUsd: amount };
    if (coin.id === BRIDGE_USDC_ID) return { ...q, ok: true, out: usdcOut, outUsd: usdcOut, minOut: usdcOut, swapFeeUsd: 0, seconds: BRIDGE_SECONDS };
    const units = toBaseUnits(fmt(usdcOut));
    const { best, alt, first } = await legQuotes("buy", coin, units!);
    if (!best) return { ...q, error: first?.route.error ?? "No swap network has a route right now." };
    const route = best.route;
    return {
      ...q, ok: true, out: route.expectedOut, outUsd: route.expectedOutUsd, minOut: route.minOut, swapFeeUsd: route.fees.totalUsd,
      seconds: BRIDGE_SECONDS + (route.seconds ?? 0), protocol: best.p, alt,
    };
  }

  // sell: coin -> USDC (THORChain) -> TSD (bridge)
  const q = { ...base, bridgeFeeBps: s.mintFeeBps };
  let usdcIn = amount;
  let swapFeeUsd: number | null = 0;
  let seconds = BRIDGE_SECONDS;
  let amountUsd: number | null = amount;
  let protocol: Protocol | null = null;
  let alt: TsdRouteQuote["alt"] = null;
  if (coin.id !== BRIDGE_USDC_ID) {
    const legs = await legQuotes("sell", coin, toBaseUnits(amountStr)!);
    if (!legs.best) return { ...q, error: legs.first?.route.error ?? "No swap network has a route right now." };
    const { route, inputUsd } = legs.best;
    usdcIn = route.expectedOut;
    swapFeeUsd = route.fees.totalUsd;
    seconds += route.seconds ?? 0;
    amountUsd = inputUsd;
    protocol = legs.best.p;
    alt = legs.alt ? { protocol: legs.alt.protocol, out: afterBridgeFee(legs.alt.out, s.mintFeeBps) } : null;
  }
  if (usdcIn < s.minAmount) return { ...q, amountUsd, error: `That's about ${fmt(usdcIn, 2)} USDC — under TSD Bridge's ${s.minAmount} minimum.` };
  const tsd = afterBridgeFee(usdcIn, s.mintFeeBps);
  return { ...q, ok: true, usdc: usdcIn, out: tsd, outUsd: tsd, minOut: null, amountUsd, swapFeeUsd, seconds, protocol, alt };
}

/* ---------------------------------- start ---------------------------------- */

export type StartRouteInput = { direction: RouteDirection; coin: string; amount: string; shownOut: number };

export async function startTsdRoute(userId: string, isAdmin: boolean, input: StartRouteInput) {
  const coin = swapCoin(input.coin);
  if (!coin) throw new Error("Pick a coin.");
  const { loadLink } = await import("./send.server");
  const link = await loadLink(userId);
  const linkLike = link ? { mode: link.mode, hasKey: link.hasKey, pockets: link.pockets as string[] } : null;
  const early = routeBlocker({ direction: input.direction, coin, link: linkLike, isAdmin, amountUsd: 0, tsdAmount: null });
  if (early) throw new Error(early);

  const q = await quoteTsdRoute(input.direction, coin, input.amount);
  if (!q.ok) throw new Error(q.error ?? "No route right now.");
  const blocker = routeBlocker({
    direction: input.direction, coin, link: linkLike, isAdmin, amountUsd: q.amountUsd,
    tsdAmount: input.direction === "buy" ? q.amountIn : q.out,
  });
  if (blocker) throw new Error(blocker);
  if (!requoteOk(input.shownOut, q.out)) {
    throw new Error(`The price moved more than 1% since you looked (now ${q.out}). Check the new quote and try again.`);
  }

  const txc = link!.addresses.TXC!;
  const evm = link!.addresses.EVM!;
  const coinPocket = input.direction === "buy" ? receivePocket(coin) : sendSource(coin)?.pocket;
  const coinAddress = coin.id === BRIDGE_USDC_ID ? evm : link!.addresses[coinPocket!]!;

  // The Ethereum fee is paid from the member's own pocket unless Seeds' gas wallet covers it:
  // say so before any coin leaves, instead of after the TSD is already with TSD Bridge.
  const gasUnits = routeGasUnits(input.direction, coin);
  if (gasUnits > 0n) {
    const g = await gasState(evm, gasUnits);
    const reason = gasPreflight({ needWei: g.needWei, haveWei: g.haveWei, coveredBySeeds: await gasWalletConfigured() });
    if (reason) throw new Error(reason);
  }

  if (input.direction === "buy") {
    const [bal, locked] = await freeTsd(userId, txc);
    if (bal == null) throw new Error("Couldn't read your TSD balance. Try again in a minute.");
    if (bal - locked < q.amountIn) {
      throw new Error(locked > 0
        ? `You have ${fmt(bal, 2)} TSD, but ${fmt(locked, 2)} is set aside for P2P trades. Free to swap: ${fmt(Math.max(0, bal - locked), 2)} TSD.`
        : `Your trading pocket has ${fmt(bal, 2)} TSD.`);
    }
  }

  const { data: id, error } = await supabaseAdmin.rpc("reserve_tsd_route", {
    _user_id: userId, _link_id: link!.id, _direction: input.direction, _coin: coin.id, _coin_asset: coin.asset,
    _amount_in: q.amountIn, _amount_usd: Math.round((q.amountUsd ?? 0) * 100) / 100, _shown_usdc: q.usdc, _shown_out: q.out,
    _bridge_fee_bps: q.bridgeFeeBps, _txc_address: txc, _evm_address: evm, _coin_address: coinAddress,
    _per_swap_max_usd: SWAP_LIMITS.perSwapUsd, _daily_max_usd: SWAP_LIMITS.dailyUsd, _protocol: q.protocol ?? "thorchain",
  });
  if (error || !id) throw new Error(clean(error?.message ?? "Could not start this swap."));
  await advanceRoute(id as string);
  const { data: row } = await supabaseAdmin.from("tsd_routes").select("id, stage, error").eq("id", id as string).single();
  return row;
}

/**
 * What this swap's Ethereum fee will cost the member, and whether their pocket can pay it.
 * Nulls mean nothing to report: no Ethereum leg, or Seeds' gas wallet covers the fee.
 */
export async function gasCheck(userId: string, direction: RouteDirection, coin: SwapCoin) {
  const units = routeGasUnits(direction, coin);
  const covered = await gasWalletConfigured();
  const none = { covered, needEth: null as number | null, haveEth: null as number | null, shortEth: null as number | null, shortUsd: null as number | null };
  if (units === 0n || covered) return none;
  const { loadLink } = await import("./send.server");
  const link = await loadLink(userId);
  const g = await gasState(link?.addresses.EVM ?? null, units);
  const short = g.haveWei != null && g.needWei > g.haveWei ? g.needWei - g.haveWei : null;
  return {
    covered,
    needEth: g.needWei > 0n ? Number(g.needWei) / 1e18 : null,
    haveEth: g.haveWei != null ? Number(g.haveWei) / 1e18 : null,
    shortEth: short != null ? Number(short) / 1e18 : null,
    shortUsd: short != null && g.priceUsd != null ? (Number(short) / 1e18) * g.priceUsd : null,
  };
}

/** TSD in the member's TXC pocket and how much of it P2P trades have set aside. */
async function freeTsd(userId: string, txcAddress: string): Promise<[number | null, number]> {
  const { fetchOmniBalance } = await import("@/lib/omni.server");
  const { lockedAmount } = await import("@/lib/p2p.server");
  const [b, locked] = await Promise.all([fetchOmniBalance(txcAddress), lockedAmount(userId, "TSD")]);
  return [b.online ? b.balance : null, locked];
}

/* --------------------------------- advance --------------------------------- */

async function claim(id: string): Promise<Row | null> {
  const now = new Date();
  const until = new Date(now.getTime() + 90_000).toISOString();
  const { data } = await supabaseAdmin
    .from("tsd_routes")
    .update({ working_until: until })
    .eq("id", id)
    .not("stage", "in", "(done,refunded,kept_usdc,failed)")
    .or(`working_until.is.null,working_until.lt.${now.toISOString()}`)
    .select("*")
    .maybeSingle();
  return (data as Row | null) ?? null;
}

async function save(id: string, patch: Partial<Row>) {
  const { error } = await supabaseAdmin
    .from("tsd_routes")
    .update({ ...patch, updated_at: new Date().toISOString(), checked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Could not record the swap: ${error.message}`);
}

const move = (stage: RouteStage, extra: Partial<Row> = {}): Partial<Row> => ({ stage, step_at: new Date().toISOString(), error: null, ...extra });

async function notify(r: Row, text: string) {
  try {
    const { notifyUser } = await import("@/lib/telegram.server");
    await notifyUser(r.user_id, "notify_settlement", text);
  } catch (e) {
    console.error("tsd route alert failed", e);
  }
}

async function ciphertextFor(r: Row): Promise<string | null> {
  const { data } = await supabaseAdmin.from("hme_links").select("key_ciphertext, status").eq("id", r.link_id!).maybeSingle();
  if (!data || data.status !== "active") throw new Error("Your trading pocket was unlinked, so Seeds stopped this swap.");
  return data.key_ciphertext;
}

const minutesSince = (iso: string) => (Date.now() - Date.parse(iso)) / 60_000;

async function usdcBalance(address: string): Promise<number | null> {
  const { fetchTokenBalance } = await import("@/lib/evm.server");
  return fetchTokenBalance(ETH, BRIDGE_USDC_CONTRACT, address, 6);
}

const legProtocol = (r: Pick<Row, "protocol">): Protocol => (r.protocol === "maya" ? "maya" : "thorchain");

/**
 * The swap leg, from USDC (buy) or from the coin (sell). Tries the network chosen at
 * the quote first; if that network can't take the swap right now (paused, no route,
 * a pre-send check failed — nothing reserved or sent), the other one is tried with
 * the same price reference and limits.
 */
async function sendLeg(r: Row, coin: SwapCoin): Promise<Partial<Row>> {
  const { sendSwapFromPocket, PriceMovedError, RouteUnavailableError } = await import("./send.server");
  const buy = r.direction === "buy";
  const amountIn = buy ? Number(r.usdc_amount) : Number(r.amount_in);
  const shownOut = buy ? (Number(r.shown_out) * amountIn) / Number(r.shown_usdc) : Number(r.shown_usdc);
  const chosen = legProtocol(r);
  const order = [chosen, ...legProtocols(r.direction as RouteDirection, coin, usdc()).filter((p) => p !== chosen)];
  let lastUnavailable: Error | null = null;
  for (const protocol of order) {
    try {
      const sent = await sendSwapFromPocket(r.user_id, false, {
        from: buy ? BRIDGE_USDC_ID : coin.id, to: buy ? coin.id : BRIDGE_USDC_ID,
        amount: fmt(amountIn, buy ? 6 : 8), destination: buy ? r.coin_address : r.evm_address, shownOut, protocol,
      }, { routeId: r.id, tolerance: TSD_ROUTE.legTolerance });
      return move("swap_sent", { swap_send_id: sent.id, protocol });
    } catch (e) {
      if (e instanceof PriceMovedError) {
        const fresh = e.freshOut; // coin (buy) or USDC (sell)
        void notify(r, `Seeds paused your TSD swap: the price moved more than ${TSD_ROUTE.legTolerance * 100}%. Open Seeds → Swap to continue at the new price${buy ? " or keep the USDC" : ""}.`);
        return move("needs_ok", { fresh_out: fresh });
      }
      if (e instanceof RouteUnavailableError) {
        lastUnavailable = e;
        continue;
      }
      throw e;
    }
  }
  throw lastUnavailable ?? new Error("No swap network can take this swap right now.");
}

/** Run one step of a route. Returns true if the stage changed (the caller may step again). */
async function step(r: Row): Promise<boolean> {
  const coin = swapCoin(r.coin)!;
  const direct = coin.id === BRIDGE_USDC_ID;
  const stage = r.stage as RouteStage;
  const go = async (patch: Partial<Row>) => {
    await save(r.id, patch);
    return patch.stage !== undefined && patch.stage !== stage;
  };

  // ---------- shared: waiting for a Seeds gas top-up ----------
  if (stage === "gas_pending") {
    const { gasTopUpConfirmed } = await import("./gas.server");
    const s = await gasTopUpConfirmed(r.gas_txid!);
    if (s === "no") return go({});
    return go(move((r.resume_stage as RouteStage) ?? "swapping", { gas_txid: null, resume_stage: null }));
  }

  /** Make sure the EVM pocket can pay `units` of gas; returns a patch if we have to wait. */
  const gas = async (units: bigint): Promise<Partial<Row> | null> => {
    const { ensureGas } = await import("./gas.server");
    const g = await ensureGas({ routeId: r.id, userId: r.user_id, pocket: r.evm_address, gasUnits: units });
    if (g.kind === "ok") return null;
    if (g.kind === "pending") return move("gas_pending", { gas_txid: g.txid, resume_stage: stage });
    return { error: g.reason };
  };

  /** Stop before anything moves when the pocket can't pay the Ethereum fee and Seeds isn't covering it. */
  const preflight = async (): Promise<Partial<Row> | null> => {
    const units = routeGasUnits(r.direction as RouteDirection, coin);
    if (units === 0n) return null;
    const g = await gasState(r.evm_address, units);
    const reason = gasPreflight({ needWei: g.needWei, haveWei: g.haveWei, coveredBySeeds: await gasWalletConfigured() });
    return reason ? move("failed", { error: reason }) : null;
  };

  if (r.direction === "buy") {
    switch (stage) {
      case "reserved": {
        const stop = await preflight();
        if (stop) return go(stop);
        const { createRedeemOrder } = await import("./tsd-bridge.server");
        const o = await createRedeemOrder({ amount: Number(r.amount_in), payout: r.evm_address, refund: r.txc_address, reference: r.id.slice(0, 8) });
        const problem = redeemOrderProblem(o, { payout: r.evm_address, amount: Number(r.amount_in), maxFeeBps: Math.min(TSD_ROUTE.maxBridgeFeeBps, r.bridge_fee_bps) });
        if (problem) return go(move("failed", { error: `${problem} Nothing was sent.`, bridge_order_id: o.id ?? null }));
        return go(move("sending_tsd", { bridge_order_id: o.id!, bridge_deposit: o.depositAddress ?? o.sendTo! }));
      }
      case "sending_tsd": {
        if (r.tsd_txid) {
          // Recorded before broadcast: only check it, never sign again.
          const { fetchOmniTx } = await import("@/lib/omni.server");
          const t = await fetchOmniTx(r.tsd_txid);
          if (t.confirmations != null || t.valid != null) return go(move("bridging"));
          if (minutesSince(r.step_at) > TSD_ROUTE.lostTxMinutes) return go(move("failed", { error: "The TSD send never reached the network. Nothing left your pocket; the team will double-check." }));
          return go({});
        }
        const [bal, locked] = await freeTsd(r.user_id, r.txc_address);
        if (bal == null) return go({ error: "Couldn't read your TSD balance; retrying." });
        if (bal - locked < Number(r.amount_in)) return go(move("failed", { error: "Your free TSD balance dropped below the swap amount. Nothing was sent." }));
        // The bridge order must still be open well past the time the TSD needs to confirm.
        {
          const { getBridgeOrder } = await import("./tsd-bridge.server");
          const o = await getBridgeOrder(r.bridge_order_id!);
          const left = o.expiresAt ? Date.parse(o.expiresAt) - Date.now() : Infinity;
          if (o.status !== "awaiting_deposit" || left < 10 * 60_000) return go(move("reserved", { bridge_order_id: null, bridge_deposit: null }));
        }
        const { withPocketKey, tellMember } = await import("./send.server");
        const { omniSimpleSend } = await import("@/lib/omni.server");
        const { bytesToHex } = await import("@noble/hashes/utils.js");
        const cipher = await ciphertextFor(r);
        let recorded = false;
        try {
          const sent = await withPocketKey(cipher, "TXC", r.txc_address, (priv) => omniSimpleSend({
            privateKeyHex: bytesToHex(priv), fromAddress: r.txc_address, toAddress: r.bridge_deposit!, amount: Number(r.amount_in),
            beforeBroadcast: async (txid) => { await save(r.id, { tsd_txid: txid }); recorded = true; },
          }));
          void tellMember(r.user_id, `TSD swap started: sent ${r.amount_in} TSD to TSD Bridge for ${coin.symbol}. Tx ${sent.txid}`, [
            `Sent ${r.amount_in} TSD from your trading pocket to TSD Bridge (order ${r.bridge_order_id})`,
            `TSD Bridge pays USDC to your own EVM pocket ${r.evm_address}, then ${PROTOCOL_LABEL[legProtocol(r)]} swaps it to ${coin.symbol}`,
            `Network transaction ${sent.txid}`,
          ]);
          return go(move("bridging", { tsd_txid: sent.txid }));
        } catch (e) {
          if (recorded) return go({ error: `Sent, waiting for the network to confirm (${e instanceof Error ? e.message : e}).` });
          const msg = e instanceof Error ? e.message : String(e);
          if (/TXC|miner fee/i.test(msg)) return go(move("failed", { error: `Your TXC pocket needs a little TXC (about 0.002) to pay the TSD network fee. Nothing was sent.` }));
          throw e;
        }
      }
      case "bridging": {
        const { getBridgeOrder } = await import("./tsd-bridge.server");
        const o = await getBridgeOrder(r.bridge_order_id!);
        const p = bridgeProgress(o, "buy");
        if (p === "refunded") {
          void notify(r, `TSD Bridge returned your ${r.amount_in} TSD to your pocket. Tx ${o.refundTxid ?? "pending"}`);
          return go(move("refunded", { bridge_out_txid: o.refundTxid ?? null }));
        }
        if (p === "failed") return go(move("failed", { error: `TSD Bridge reports this order ${o.status}${o.error ? ` (${o.error})` : ""}. Your TSD is with TSD Bridge; the team will sort it out with them.` }));
        if (p === "waiting") {
          if (r.tsd_txid) {
            const { fetchOmniTx } = await import("@/lib/omni.server");
            const t = await fetchOmniTx(r.tsd_txid);
            if ((t.confirmations ?? 0) >= 1 && t.valid === false) {
              return go(move("failed", { error: `The TEXITcoin network rejected the TSD transfer (${t.invalidReason ?? "invalid"}). Your TSD didn't move.` }));
            }
          }
          return go({});
        }
        const paid = Number(o.payoutAmount ?? 0);
        const bal = await usdcBalance(r.evm_address);
        if (!(paid > 0) || bal == null || bal + 1e-6 < paid) return go({ bridge_out_txid: o.releaseTxHash ?? null }); // release not visible yet
        if (direct) {
          void notify(r, `Done: ${fmt(paid, 2)} USDC is in your EVM pocket. Tx ${o.releaseTxHash}`);
          return go(move("done", { usdc_amount: paid, amount_out: paid, bridge_out_txid: o.releaseTxHash ?? null }));
        }
        return go(move("swapping", { usdc_amount: paid, bridge_out_txid: o.releaseTxHash ?? null }));
      }
      case "swapping": {
        const wait = await gas(GAS_SWAP_LEG);
        if (wait) {
          if (wait.stage) return go(wait);
          if (minutesSince(r.step_at) > 60) return go(move("kept_usdc", { error: `Stopped after an hour: ${wait.error} Your USDC is in your EVM pocket.` }));
          return go(wait);
        }
        try {
          return go(await sendLeg(r, coin));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (minutesSince(r.step_at) > 60) return go(move("kept_usdc", { error: `Stopped after an hour: ${msg} Your USDC is in your EVM pocket.` }));
          return go({ error: msg.slice(0, 300) });
        }
      }
      case "swap_sent":
        return followLeg(r, coin, go);
      default:
        return go({});
    }
  }

  // ---------------------------------- sell ----------------------------------
  switch (stage) {
    case "reserved": {
      const stop = await preflight();
      if (stop) return go(stop);
      return go(move(direct ? "minting" : "swapping", direct ? { usdc_amount: r.amount_in } : {}));
    }
    case "swapping": {
      if (sendSource(coin)?.kind === "erc20") {
        const wait = await gas(GAS_SWAP_LEG);
        if (wait) return go(wait.stage ? wait : minutesSince(r.step_at) > 30 ? move("failed", { error: `${wait.error} Nothing was sent.` }) : wait);
      }
      try {
        return go(await sendLeg(r, coin));
      } catch (e) {
        // The leg throws before reserving when it can't send: nothing has moved yet.
        return go(move("failed", { error: `${e instanceof Error ? e.message : e} Nothing was sent.` }));
      }
    }
    case "swap_sent":
      return followLeg(r, coin, go);
    case "minting": {
      const amount = Math.floor(Number(r.usdc_amount) * 1e6) / 1e6;
      if (r.usdc_txid) {
        const { fetchEvmTxStatus } = await import("@/lib/evm.server");
        const s = await fetchEvmTxStatus(ETH, r.usdc_txid);
        if (s.success === false) return go(move("failed", { error: "The USDC transfer to TSD Bridge failed on Ethereum. Your USDC is still in your EVM pocket." }));
        if ((s.confirmations ?? 0) >= 1) return go(move("bridging"));
        if (minutesSince(r.step_at) > TSD_ROUTE.lostTxMinutes && s.confirmations === 0) return go({ error: "Waiting for Ethereum to pick up the USDC transfer." });
        return go({});
      }
      const wait = await gas(GAS_USDC_TRANSFER);
      if (wait) return go(wait);
      const { createMintOrder, getBridgeOrder } = await import("./tsd-bridge.server");
      let orderId = r.bridge_order_id;
      let deposit = r.bridge_deposit;
      if (orderId) {
        // Never pay into an order that is closing: start a fresh one instead.
        const o = await getBridgeOrder(orderId);
        const left = o.expiresAt ? Date.parse(o.expiresAt) - Date.now() : Infinity;
        if (o.status !== "awaiting_deposit" || left < 10 * 60_000) {
          orderId = null;
          deposit = null;
        }
      }
      if (!orderId) {
        const o = await createMintOrder({ amount, recipient: r.txc_address, reference: r.id.slice(0, 8) });
        const problem = mintOrderProblem(o, { recipient: r.txc_address, maxFeeBps: Math.min(TSD_ROUTE.maxBridgeFeeBps, r.bridge_fee_bps) });
        if (problem) return go(move("failed", { error: `${problem} Your USDC is still in your EVM pocket.`, bridge_order_id: o.id ?? null }));
        orderId = o.id!;
        deposit = o.depositAddress ?? o.sendTo!;
        await save(r.id, { bridge_order_id: orderId, bridge_deposit: deposit });
      }
      const bal = await usdcBalance(r.evm_address);
      if (bal == null || bal + 1e-6 < amount) return go({ error: "Waiting for the USDC to show in your EVM pocket." });
      const { withPocketKey, tellMember } = await import("./send.server");
      const { erc20TransferData, signEip1559 } = await import("@/lib/evm/tx.server");
      const { fetchNonce, sendRawTransaction, suggestFees } = await import("@/lib/evm.server");
      const { bytesToHex } = await import("@noble/hashes/utils.js");
      const cipher = await ciphertextFor(r);
      const [nonce, fees] = await Promise.all([fetchNonce(ETH, r.evm_address), suggestFees(ETH)]);
      if (nonce == null || !fees) return go({ error: "Ethereum node unreachable; retrying." });
      const units = BigInt(Math.round(amount * 1e6));
      const tx = await withPocketKey(cipher, "EVM", r.evm_address, async (priv) =>
        signEip1559({ privateKeyHex: bytesToHex(priv), chainId: 1, nonce, ...fees, gasLimit: GAS_USDC_TRANSFER, to: BRIDGE_USDC_CONTRACT, value: 0n, data: erc20TransferData(deposit!, units) }));
      await save(r.id, { usdc_txid: tx.hash, usdc_amount: amount });
      try {
        await sendRawTransaction(ETH, tx.raw);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/timeout|unreachable|fetch|abort|network|socket|reset|50\d/i.test(msg)) {
          // Definitely refused by the node: safe to clear and try again next tick.
          await save(r.id, { usdc_txid: null, error: msg.slice(0, 300) });
          return false;
        }
        return go({ error: `Sent, waiting for Ethereum to confirm (${msg}).` });
      }
      void tellMember(r.user_id, `Sent ${fmt(amount, 2)} USDC to TSD Bridge; your TSD is on its way. Tx ${tx.hash}`, [
        `Sent ${fmt(amount, 2)} USDC from your EVM pocket to TSD Bridge (order ${orderId})`,
        `TSD Bridge issues TSD to your own TXC pocket ${r.txc_address}`,
        `Network transaction ${tx.hash}`,
      ]);
      return go({});
    }
    case "bridging": {
      const { getBridgeOrder } = await import("./tsd-bridge.server");
      const o = await getBridgeOrder(r.bridge_order_id!);
      const p = bridgeProgress(o, "sell");
      if (p === "waiting") return go({});
      if (p !== "paid") return go(move("failed", { error: `TSD Bridge reports this order ${o.status}${o.error ? ` (${o.error})` : ""}. The team will sort it out with them.` }));
      const got = afterBridgeFee(Number(o.amountReceived ?? r.usdc_amount), r.bridge_fee_bps);
      void notify(r, `Done: about ${fmt(got, 2)} TSD is in your trading pocket. Tx ${o.mintTxid ?? o.releaseTxHash}`);
      return go(move("done", { amount_out: got, bridge_out_txid: o.mintTxid ?? o.releaseTxHash ?? null }));
    }
    default:
      return go({});
  }
}

/** Follow the swap leg through swap_sends (refreshed from THORChain / Maya). */
async function followLeg(r: Row, coin: SwapCoin, go: (p: Partial<Row>) => Promise<boolean>): Promise<boolean> {
  const { refreshSwapSends } = await import("./send.server");
  await refreshSwapSends(r.user_id).catch(() => undefined);
  const { data: s } = await supabaseAdmin.from("swap_sends").select("status, txid, out_txid, expected_out").eq("id", r.swap_send_id!).single();
  if (!s) return go({ error: "Lost track of the swap step; the team will check." });
  const buy = r.direction === "buy";
  const label = PROTOCOL_LABEL[legProtocol(r)];
  if (s.status === "done") {
    if (buy) {
      const hmeNote = landsOutsideHmeWallet(coin) ? ` HME Wallet can't hold ${coin.symbol} — swap it back to TSD on Seeds before you revoke Seeds' access.` : "";
      void notify(r, `Done: your ${coin.symbol} is in your trading pocket. Tx ${s.out_txid ?? s.txid}.${hmeNote}`);
      return go(move("done", { amount_out: s.expected_out }));
    }
    const out = await legOutputUsdc(legProtocol(r), s.txid!);
    return go(move("minting", { usdc_amount: out ?? Number(s.expected_out) }));
  }
  if (s.status === "refunded") {
    void notify(r, buy ? `${label} refunded the USDC to your EVM pocket (price protection). Nothing was lost.` : `${label} refunded your ${coin.symbol} to your pocket. Nothing was lost.`);
    return go(move(buy ? "kept_usdc" : "refunded", { error: buy ? `${label} refunded the USDC to your EVM pocket.` : null }));
  }
  if (s.status === "failed") return go(move(buy ? "kept_usdc" : "failed", { error: buy ? `The ${label} step didn't go out. Your USDC is in your EVM pocket.` : `The ${label} step didn't go out. Nothing was sent.` }));
  return go({});
}

/** USDC the swap network actually paid out on Ethereum (1e8 units in /tx/status), or null if unreadable. */
async function legOutputUsdc(protocol: Protocol, txid: string): Promise<number | null> {
  const { protocolTxStatus } = await import("./router.server");
  const { thorTxId } = await import("./send-rules");
  const s = (await protocolTxStatus(protocol, thorTxId(txid))) as { out_txs?: Array<{ memo?: string; chain?: string; coins?: Array<{ asset?: string; amount?: string }> }> } | null;
  // Maya also lists CACAO payouts on its own chain; only the Ethereum USDC payout counts.
  const out = s?.out_txs?.find((o) => /^OUT/i.test(o.memo ?? "") && (o.coins ?? []).some((x) => (x.asset ?? "").toUpperCase() === usdc().asset.toUpperCase()));
  const c = out?.coins?.find((x) => (x.asset ?? "").toUpperCase() === usdc().asset.toUpperCase());
  const n = c?.amount ? Number(c.amount) / 1e8 : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Claim and advance one route, up to 4 steps in a row. Safe to call from anywhere, any time. */
export async function advanceRoute(id: string): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const r = await claim(id);
    if (!r) return;
    let changed = false;
    try {
      changed = await step(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("tsd route step failed", id, r.stage, msg);
      await save(id, { error: msg.slice(0, 300) }).catch(() => undefined);
    } finally {
      await supabaseAdmin.from("tsd_routes").update({ working_until: null }).eq("id", id);
    }
    if (!changed) return;
  }
}

/** Cron: every open route not checked in the last 45 seconds (10 per run). */
export async function advanceOpenRoutes(): Promise<{ checked: number }> {
  const stale = new Date(Date.now() - 45_000).toISOString();
  const { data } = await supabaseAdmin
    .from("tsd_routes")
    .select("id, stage")
    .not("stage", "in", "(done,refunded,kept_usdc,failed,needs_ok)")
    .or(`checked_at.is.null,checked_at.lt.${stale}`)
    .order("checked_at", { ascending: true, nullsFirst: true })
    .limit(10);
  for (const r of data ?? []) await advanceRoute(r.id);
  return { checked: data?.length ?? 0 };
}

/* ------------------------------ member actions ------------------------------ */

/** needs_ok: continue at the new price, or stop (buy keeps the USDC; sell hasn't sent anything). */
export async function answerRoute(userId: string, id: string, choice: "continue" | "stop") {
  const { data: r } = await supabaseAdmin.from("tsd_routes").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!r) throw new Error("Swap not found.");
  if (r.stage !== "needs_ok") throw new Error("This swap isn't waiting for you.");
  const buy = r.direction === "buy";
  if (choice === "stop") {
    const { error } = await supabaseAdmin.from("tsd_routes").update(move(buy ? "kept_usdc" : "failed", {
      error: buy ? "You kept the USDC in your EVM pocket." : "You cancelled. Nothing was sent.", updated_at: new Date().toISOString(),
    })).eq("id", id).eq("stage", "needs_ok");
    if (error) throw new Error(error.message);
    return;
  }
  const fresh = Number(r.fresh_out);
  if (!(fresh > 0)) throw new Error("No new price to accept.");
  // The member accepts the new price: it becomes the reference the leg is checked against.
  const patch = buy
    ? { shown_out: (fresh * Number(r.shown_usdc)) / Number(r.usdc_amount) }
    : { shown_usdc: fresh, shown_out: afterBridgeFee(fresh, r.bridge_fee_bps) };
  const { error } = await supabaseAdmin.from("tsd_routes").update({ ...move("swapping"), ...patch, fresh_out: null, updated_at: new Date().toISOString() }).eq("id", id).eq("stage", "needs_ok");
  if (error) throw new Error(error.message);
  await advanceRoute(id);
}

export async function listTsdRoutes(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("tsd_routes")
    .select("id, protocol, direction, coin, amount_in, amount_usd, shown_usdc, shown_out, fresh_out, usdc_amount, amount_out, stage, resume_stage, error, tsd_txid, usdc_txid, bridge_out_txid, swap_send_id, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  // The swap step's transaction, so the swap can be tracked on RuneScan / MayaScan.
  const legIds = rows.map((r) => r.swap_send_id).filter((x): x is string => Boolean(x));
  const txids = new Map<string, string | null>();
  if (legIds.length) {
    const { data: legs, error: legErr } = await supabaseAdmin.from("swap_sends").select("id, txid").eq("user_id", userId).in("id", legIds);
    if (legErr) throw new Error(legErr.message);
    for (const l of legs ?? []) txids.set(l.id, l.txid);
  }
  return rows.map((r) => ({ ...r, swap_txid: r.swap_send_id ? (txids.get(r.swap_send_id) ?? null) : null }));
}

export { isTerminal };
