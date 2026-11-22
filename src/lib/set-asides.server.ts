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

export async function loadSetAsides(userId: string): Promise<Partial<Record<LegId, SetAside>>> {
  const { P2P_ASSETS } = await import("@/lib/p2p-config");
  const [orders, trades, p2p] = await Promise.all([
    supabaseAdmin.from("orders").select("pair, side, price, amount, filled").eq("user_id", userId).in("status", ["open", "partial"]),
    supabaseAdmin.from("trades").select("id, status, side, amount, price, pair, maker_id, taker_id")
      .or(`maker_id.eq.${userId},taker_id.eq.${userId}`).in("status", [...ACTIVE_TRADE]),
    supabaseAdmin.from("p2p_trades").select("asset, crypto_amount").eq("seller_id", userId).in("status", [...LIVE_P2P]),
  ]);
  if (orders.error || trades.error || p2p.error) throw new Error("Couldn't check what's set aside for your trades. Try again in a minute.");

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
        unsent.push({ leg, amount: legAmount(t, role) });
      }
    }
  }

  const p2pRows: Array<{ leg: LegId; amount: number }> = [];
  for (const r of p2p.data ?? []) {
    const a = P2P_ASSETS[r.asset as keyof typeof P2P_ASSETS];
    if (a) p2pRows.push({ leg: a.leg, amount: Number(r.crypto_amount) });
  }
  return setAsidesByLeg({ orders: (orders.data ?? []) as never, unsentLegs: unsent, p2p: p2pRows });
}

export async function setAsideFor(userId: string, leg: LegId): Promise<SetAside> {
  return (await loadSetAsides(userId))[leg] ?? NOTHING_SET_ASIDE;
}

/**
 * May this send of `amount` go out of the pocket without touching coins set aside for
 * trades? `address` = the pocket address it leaves from; `network` = EVM network of the
 * send (null for one-network coins). Reads the balance only when something is set aside.
 * Plain reason, or null. Fails closed: an unreadable balance or set-aside refuses.
 */
export async function pocketSpendProblem(userId: string, leg: LegId, amount: number, at: { address: string; network?: string | null }): Promise<string | null> {
  const s = await setAsideFor(userId, leg);
  if (s.total <= 1e-8) return null;
  const { pocketLegBalancesByNetwork } = await import("@/lib/pocket-send/pocket.server");
  const balances = await pocketLegBalancesByNetwork(at.address, leg).catch(() => null);
  return spendProblem({ symbol: getLeg(leg).symbol, setAside: s, balances, amount, network: at.network ?? null });
}
