/**
 * When each Seeds email goes out. Every function is best-effort (emailUser
 * never throws) and reads facts from server-written rows only.
 */
import { getPair } from "@/lib/chains";
import { baseSeller, legRole } from "@/lib/leg-roles";
import { emailUser, unsubscribeUrl } from "./send.server";

/** Once per account, right after the first HME sign-in creates it. */
export async function emailWelcome(userId: string) {
  return emailUser(userId, "welcome", (r) => ({ name: r.name }), { dedupe: "once" });
}

/** Both sides, once, when every leg of an exchange trade has released. */
export async function emailTradeSettled(tradeId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: t } = await supabaseAdmin.from("trades")
    .select("id, pair, side, amount, price, maker_id, taker_id, status, updated_at").eq("id", tradeId).maybeSingle();
  if (!t || t.status !== "settled" || t.pair == null) return;
  const pair = getPair(t.pair);
  const { data: legs } = await supabaseAdmin.from("escrows").select("leg, expected_amount, funding_txid, release_txid").eq("trade_id", tradeId);
  const seller = baseSeller(t);
  for (const uid of new Set([t.maker_id, t.taker_id].filter((x): x is string => Boolean(x)))) {
    const isSeller = uid === seller;
    const mine = (legs ?? []).map((l) => {
      const role = legRole(t.pair, l.leg);
      const receives = (role === "base") !== isSeller;
      return {
        label: receives ? "You received" : "You sent",
        amount: Number(l.expected_amount),
        symbol: role === "base" ? pair.base : pair.quote,
        txid: (l.release_txid ?? l.funding_txid) as string | null,
        order: receives ? 0 : 1,
      };
    }).sort((a, b) => a.order - b.order).map(({ order: _o, ...rest }) => rest);
    await emailUser(uid, "trade-confirmation", (r) => ({
      name: r.name, tradeId: t.id, pair: pair.label, side: isSeller ? "sell" : "buy",
      amount: Number(t.amount), baseSymbol: pair.base, price: Number(t.price), quoteSymbol: pair.quote,
      settledAt: t.updated_at, timezone: r.timezone, legs: mine,
    }), { dedupe: tradeId });
  }
}

/** Buyer and seller, once, when a P2P trade opens. */
export async function emailP2pOpened(tradeId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: t } = await supabaseAdmin.from("p2p_trades")
    .select("id, buyer_id, seller_id, asset, crypto_amount, fiat_amount, price, payment_method, expires_at").eq("id", tradeId).maybeSingle();
  if (!t) return;
  const { data: handles } = await supabaseAdmin.from("p2p_profiles").select("user_id, handle").in("user_id", [t.buyer_id, t.seller_id]);
  const handle = (id: string) => handles?.find((h) => h.user_id === id)?.handle ?? "your trade partner";
  for (const [uid, role, other] of [[t.buyer_id, "buyer", t.seller_id], [t.seller_id, "seller", t.buyer_id]] as const) {
    await emailUser(uid, "p2p-order", (r) => ({
      name: r.name, role, tradeId: t.id, asset: t.asset, cryptoAmount: Number(t.crypto_amount), fiatAmount: Number(t.fiat_amount),
      price: Number(t.price), paymentMethod: t.payment_method, counterparty: handle(other), expiresAt: t.expires_at, timezone: r.timezone,
    }), { dedupe: tradeId });
  }
}

/** Monday-to-Sunday window ending at `end` (exclusive), labelled like "Nov 10 – Nov 16". */
export function weekWindow(end: Date): { start: Date; end: Date; label: string; key: string } {
  const start = new Date(end.getTime() - 7 * 86_400_000);
  const last = new Date(end.getTime() - 1);
  const f = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return { start, end, label: `${f(start)} – ${f(last)}`, key: start.toISOString().slice(0, 10) };
}

export async function emailWeeklyUpdate(userId: string, end: Date) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const w = weekWindow(end);
  const since = w.start.toISOString();
  const until = w.end.toISOString();
  const [trades, p2p, open, link] = await Promise.all([
    supabaseAdmin.from("trades").select("pair, amount, price, status").or(`maker_id.eq.${userId},taker_id.eq.${userId}`).eq("is_demo", false).gte("created_at", since).lt("created_at", until),
    supabaseAdmin.from("p2p_trades").select("fiat_amount, status").or(`buyer_id.eq.${userId},seller_id.eq.${userId}`).gte("created_at", since).lt("created_at", until),
    supabaseAdmin.from("orders").select("pair, created_at").eq("user_id", userId).in("status", ["open", "partial"] as never).eq("is_demo", false),
    supabaseAdmin.from("hme_links").select("account, mode").eq("user_id", userId).eq("status", "active").maybeSingle(),
  ]);
  const byPair = new Map<string, { pair: string; amount: number; baseSymbol: string; quoteTotal: number; quoteSymbol: string }>();
  for (const t of trades.data ?? []) {
    if (!t.pair) continue;
    let p; try { p = getPair(t.pair); } catch { continue; }
    const row = byPair.get(p.id) ?? { pair: p.label, amount: 0, baseSymbol: p.base, quoteTotal: 0, quoteSymbol: p.quote };
    row.amount += Number(t.amount);
    row.quoteTotal += Number(t.amount) * Number(t.price);
    byPair.set(p.id, row);
  }
  const p2pDone = (p2p.data ?? []).filter((x) => x.status === "released");
  const attention: string[] = [];
  const stale = (open.data ?? []).filter((o) => Date.now() - new Date(o.created_at).getTime() > 5 * 86_400_000).length;
  if (stale) attention.push(`${stale} open order${stale === 1 ? " has" : "s have"} been waiting more than 5 days.`);
  const disputed = (p2p.data ?? []).filter((x) => x.status === "disputed").length;
  if (disputed) attention.push(`${disputed} P2P trade${disputed === 1 ? " is" : "s are"} in dispute.`);
  if (!link.data) attention.push("Your HME Wallet isn't linked, so you can't trade yet.");
  return emailUser(userId, "weekly-update", (r) => ({
    name: r.name, weekLabel: w.label,
    exchangeTrades: trades.data?.length ?? 0, p2pTrades: p2pDone.length, openOrders: open.data?.length ?? 0,
    volumeByPair: [...byPair.values()],
    p2pVolumeUsd: p2pDone.reduce((s, x) => s + Number(x.fiat_amount), 0),
    pocket: link.data ? { linked: true, account: link.data.account, mode: link.data.mode } : { linked: false },
    attention, unsubscribeUrl: unsubscribeUrl(userId),
  }), { dedupe: `week:${w.key}` });
}
