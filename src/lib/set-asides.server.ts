/**
 * Reads what a member has set aside for trades (rules in set-asides.ts) and checks a
 * send against it. Every Seeds-made send that isn't itself paying a trade (withdrawals,
 * swaps, loans, new P2P sales, new orders) asks pocketSpendProblem / setAsideFor first.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getLeg, getPair, type LegId } from "@/lib/chains";
import { delivererOf, legAmount, legRole, type TradeShape } from "@/lib/leg-roles";
import { NOTHING_SET_ASIDE, setAsidesByLeg, spendProblem, type SetAside, type UnsentLeg } from "@/lib/set-asides";

/** Trades still settling: one side may not have been sent yet. */
const ACTIVE_TRADE = ["matched", "maker_funded", "taker_funded", "both_funded", "disputed"] as const;
const LIVE_P2P = ["open", "paid", "disputed"] as const;

const READ_FAILED = "Couldn't check what's set aside for your trades. Try again in a minute.";
/** Sends that already have a txid on their approval have left (or are leaving) the pocket. */
const SENT_PURPOSES = ["trade_leg", "p2p_release"] as const;
/** Seeds sends that wait for a tap before they go out (audit C3). */
const WAITING_PURPOSES = ["swap_out", "loan_collateral", "loan_funding"] as const;
const EVM_NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export type SetAsideOptions = {
  /** The approval being spent right now: its own "going out" amount mustn't block it. */
  exceptApprovalId?: string;
};

export async function loadSetAsides(userId: string, opts: SetAsideOptions = {}): Promise<Partial<Record<LegId, SetAside>>> {
  const { P2P_ASSETS } = await import("@/lib/p2p-config");
  const [orders, trades, p2p, withdrawals, dex, twoStep, waiting] = await Promise.all([
    supabaseAdmin.from("orders").select("pair, side, price, amount, filled").eq("user_id", userId).in("status", ["open", "partial"]),
    supabaseAdmin.from("trades").select("id, status, side, amount, price, pair, maker_id, taker_id")
      .or(`maker_id.eq.${userId},taker_id.eq.${userId}`).in("status", [...ACTIVE_TRADE]),
    supabaseAdmin.from("p2p_trades").select("id, asset, crypto_amount").eq("seller_id", userId).in("status", [...LIVE_P2P]),
    // "Going out" (audit C3): not yet signed. Once signing starts the coins leave within seconds.
    supabaseAdmin.from("pocket_withdrawals").select("coin, chain, amount").eq("user_id", userId).in("status", ["approving", "held"]),
    supabaseAdmin.from("dex_swaps").select("network, token_in, tsd_side, amount_in").eq("user_id", userId)
      .in("status", ["awaiting_approval", "approved"]).is("two_step_id", null).is("tsd_route_id", null),
    supabaseAdmin.from("two_step_swaps").select("direction, network, token_address, coin_id, amount_in").eq("user_id", userId).in("status", ["awaiting_approval", "approved"]),
    supabaseAdmin.from("send_approvals").select("id, purpose, leg, amount, meta").eq("user_id", userId)
      .in("purpose", [...WAITING_PURPOSES]).in("status", ["pending", "approved"]).gt("expires_at", new Date().toISOString()),
  ]);
  if (orders.error || trades.error || p2p.error || withdrawals.error || dex.error || twoStep.error || waiting.error) throw new Error(READ_FAILED);

  // Audit C1: a trade leg or P2P release whose approval carries a txid has been sent —
  // Seeds stores the txid before broadcasting — so it no longer counts as promised.
  const refIds = [...((trades.data ?? []) as Array<{ id: string }>).map((t) => t.id), ...(p2p.data ?? []).map((r) => r.id as string)];
  const sentKeys = new Set<string>();
  if (refIds.length) {
    const { data: sent, error } = await supabaseAdmin.from("send_approvals").select("purpose, ref_id, leg")
      .eq("user_id", userId).in("purpose", [...SENT_PURPOSES]).in("ref_id", refIds).not("txid", "is", null);
    if (error) throw new Error(READ_FAILED);
    for (const a of sent ?? []) sentKeys.add(a.purpose === "p2p_release" ? `p2p:${a.ref_id}` : `trade:${a.ref_id}:${a.leg}`);
  }

  const unsent: UnsentLeg[] = [];
  const tradeRows = (trades.data ?? []) as unknown as TradeShape[];
  if (tradeRows.length) {
    const { data: esc, error } = await supabaseAdmin.from("escrows").select("trade_id, leg, status").in("trade_id", tradeRows.map((t) => t.id));
    if (error) throw new Error("Couldn't check what's set aside for your trades. Try again in a minute.");
    for (const t of tradeRows) {
      let legs: LegId[];
      try {
        const p = getPair(t.pair ?? "TSD_TXC");
        legs = [p.baseLeg, p.quoteLeg];
      } catch {
        continue;
      }
      for (const leg of legs) {
        const role = legRole(t.pair, leg);
        if (delivererOf(t, role) !== userId) continue;
        const e = (esc ?? []).find((x) => x.trade_id === t.id && x.leg === leg);
        // Sent (released) or refunded: no longer waiting on this pocket.
        if (e && e.status !== "awaiting_funding") continue;
        if (sentKeys.has(`trade:${t.id}:${leg}`)) continue;
        unsent.push({ leg, amount: legAmount(t, role) });
      }
    }
  }

  const p2pRows: Array<{ leg: LegId; amount: number }> = [];
  for (const r of p2p.data ?? []) {
    if (sentKeys.has(`p2p:${r.id}`)) continue;
    const a = P2P_ASSETS[r.asset as keyof typeof P2P_ASSETS];
    if (a) p2pRows.push({ leg: a.leg, amount: Number(r.crypto_amount) });
  }

  const { legForCoin, legForEvmToken, legForSwapAsset } = await import("@/lib/set-asides");
  const { swapCoin } = await import("@/lib/xchain/assets");
  const evmToken = (t: string | null) => (!t || t.toLowerCase() === EVM_NATIVE ? null : t);
  const goingOut: Array<{ leg: LegId; amount: number }> = [];
  const add = (leg: LegId | null, amount: unknown) => { if (leg) goingOut.push({ leg, amount: Number(amount) }); };
  for (const w of withdrawals.data ?? []) add(legForCoin(w.coin as string, w.chain as string), w.amount);
  for (const d of dex.data ?? []) add(d.tsd_side === "buy" ? "tsd" : legForEvmToken(d.network as string, evmToken(d.token_in as string)), d.amount_in);
  for (const t of twoStep.data ?? []) {
    const coin = swapCoin(t.coin_id as string);
    add(t.direction === "dex_then_x" ? legForEvmToken(t.network as string, evmToken(t.token_address as string)) : coin ? legForSwapAsset(coin.asset) : null, t.amount_in);
  }
  for (const a of waiting.data ?? []) {
    if (a.id === opts.exceptApprovalId) continue;
    if (a.purpose === "swap_out") {
      const from = swapCoin(String((a.meta as { from?: string } | null)?.from ?? ""));
      add(from ? legForSwapAsset(from.asset) : null, a.amount);
    } else {
      add(a.leg as LegId, a.amount);
    }
  }
  return setAsidesByLeg({ orders: (orders.data ?? []) as never, unsentLegs: unsent, p2p: p2pRows, goingOut });
}

/* ------------------------------ one at a time ------------------------------ */

/** How long one member's check-and-hold may take before the lock lapses on its own. */
const SPEND_LOCK_TTL_S = 60;
const SPEND_LOCK_WAIT_MS = 8_000;

/**
 * Audit C2: run a member's "is it free?" check together with the write that holds the
 * coins (new order, P2P sale, withdrawal request, swap request), one request at a time
 * per member, so two requests at once can't both promise the same coins. A short lease
 * row (pocket_spend_locks) — not a database session lock, which wouldn't survive between
 * the separate calls a request makes. Never nest two of these for the same member.
 */
export async function withPocketSpendLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const token = crypto.randomUUID();
  const until = Date.now() + SPEND_LOCK_WAIT_MS;
  for (;;) {
    const { data, error } = await supabaseAdmin.rpc("claim_pocket_spend_lock", { _user: userId, _token: token, _ttl_seconds: SPEND_LOCK_TTL_S });
    if (error) throw new Error("Couldn't check your pocket right now. Nothing was done. Try again in a minute.");
    if (data === true) break;
    if (Date.now() > until) throw new Error("Another request on your trading pocket is still being checked. Nothing was done. Try again in a few seconds.");
    await new Promise((r) => setTimeout(r, 300));
  }
  const began = Date.now();
  try {
    return await fn();
  } finally {
    await supabaseAdmin.rpc("release_pocket_spend_lock", { _user: userId, _token: token }).then(() => undefined, () => undefined);
    const tookMs = Date.now() - began;
    if (tookMs > SPEND_LOCK_TTL_S * 1000) await noteSlowSpendLock(tookMs, userId);
  }
}

/**
 * Auditor C2 follow-up (Bobby, Nov 23): a check that outlived its hold could have overlapped another request.
 * Note it in Admin → Bugs → Errors (one grouped entry; the member's account id only, like browser errors). Never throws.
 */
async function noteSlowSpendLock(tookMs: number, userId: string): Promise<void> {
  try {
    const sig = "5eed5106c2a5106c2a5106c2a5106c2a"; // fixed: every overrun groups under one entry
    await supabaseAdmin.rpc("record_client_error", {
      _signature: sig, _kind: "error",
      _message: `Server: a pocket check took ${Math.round(tookMs / 1000)}s, longer than its ${SPEND_LOCK_TTL_S}s hold — another request may have overlapped it. Check this account's open orders and sends.`,
      _source: "server:set-asides.withPocketSpendLock", _page: "", _browser: "server", _os: "", _viewport: "", _version: "", _host: "other", _account: userId,
    });
  } catch { /* logging must never block the request */ }
}

export async function setAsideFor(userId: string, leg: LegId, opts: SetAsideOptions = {}): Promise<SetAside> {
  return (await loadSetAsides(userId, opts))[leg] ?? NOTHING_SET_ASIDE;
}

/**
 * May this send of `amount` go out of the pocket without touching coins set aside for
 * trades? `address` = the pocket address it leaves from; `network` = EVM network of the
 * send (null for one-network coins). Reads the balance only when something is set aside.
 * Plain reason, or null. Fails closed: an unreadable balance or set-aside refuses.
 */
export async function pocketSpendProblem(userId: string, leg: LegId, amount: number, at: { address: string; network?: string | null }, opts: SetAsideOptions = {}): Promise<string | null> {
  const s = await setAsideFor(userId, leg, opts);
  if (s.total <= 1e-8) return null;
  const { pocketLegBalancesByNetwork } = await import("@/lib/pocket-send/pocket.server");
  const balances = await pocketLegBalancesByNetwork(at.address, leg).catch(() => null);
  return spendProblem({ symbol: getLeg(leg).symbol, setAside: s, balances, amount, network: at.network ?? null });
}
