/**
 * Peer-to-peer marketplace engine ("lock + watch").
 *
 * Sellers keep coins in their own authorized trading pocket. When a buyer opens
 * a trade we reserve that amount against the pocket's live on-chain balance and
 * keep re-checking it; if the pocket drops below what's reserved the trade is
 * flagged and the seller's score takes the hit. Release sends straight from the
 * seller's pocket to the buyer through the normal withdrawal gates.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { LegId } from "@/lib/chains";
import { P2P_ASSETS, type P2pAsset } from "@/lib/p2p-config";
import { previewWithdrawal, withdrawAsset } from "./withdrawal.server";

export const LIVE_STATUSES = ["open", "paid", "disputed"] as const;

export function legFor(asset: P2pAsset): LegId {
  return P2P_ASSETS[asset].leg;
}

/** A throwaway valid destination so we can read the pocket balance via preview. */
async function probeAddress(sellerId: string, asset: P2pAsset): Promise<string> {
  const { data } = await supabaseAdmin
    .from("wallets")
    .select("txc_address, evm_address")
    .eq("user_id", sellerId)
    .maybeSingle();
  const evm = P2P_ASSETS[asset].family === "evm";
  return (evm ? data?.evm_address : data?.txc_address) ?? "";
}

/** Live balance in the seller's authorized trading pocket, or null if unreadable / unauthorized. */
export async function pocketBalance(sellerId: string, asset: P2pAsset): Promise<number | null> {
  const to = await probeAddress(sellerId, asset);
  if (!to) return null;
  const p = await previewWithdrawal(sellerId, legFor(asset), to, 1e-8).catch(() => null);
  if (!p || p.balance === null) return null;
  return p.balance;
}

export async function lockedAmount(sellerId: string, asset: string, excludeTradeId?: string) {
  let q = supabaseAdmin
    .from("p2p_trades")
    .select("id, crypto_amount")
    .eq("seller_id", sellerId)
    .eq("asset", asset)
    .in("status", [...LIVE_STATUSES]);
  if (excludeTradeId) q = q.neq("id", excludeTradeId);
  const { data } = await q;
  return (data ?? []).reduce((s, t) => s + Number(t.crypto_amount), 0);
}

/** Refresh an offer's cached verified balance (balance minus what's already reserved). */
export async function refreshOffer(offerId: string) {
  const { data: offer } = await supabaseAdmin
    .from("p2p_offers")
    .select("id, seller_id, asset, side")
    .eq("id", offerId)
    .maybeSingle();
  if (!offer) return null;
  if (offer.side === "buy") return 0; // buy ads have no coins to verify
  const bal = await pocketBalance(offer.seller_id, offer.asset as P2pAsset);
  const locked = await lockedAmount(offer.seller_id, offer.asset);
  const available = Math.max(0, (bal ?? 0) - locked);
  await supabaseAdmin
    .from("p2p_offers")
    .update({ verified_balance: available, verified_at: new Date().toISOString() })
    .eq("id", offerId);
  return available;
}

export async function systemMessage(tradeId: string, body: string) {
  await supabaseAdmin.from("p2p_messages").insert({ trade_id: tradeId, sender_id: null, body });
}

/** Expire unpaid trades and flag any whose seller pocket no longer covers the reservation. */
export async function watchTrade(tradeId: string) {
  const { data: t } = await supabaseAdmin.from("p2p_trades").select("*").eq("id", tradeId).maybeSingle();
  if (!t) return null;
  if (t.status === "open" && new Date(t.expires_at).getTime() < Date.now()) {
    await supabaseAdmin
      .from("p2p_trades")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), resolution: "expired" })
      .eq("id", t.id);
    await systemMessage(t.id, "Payment window ran out — trade cancelled, coins unreserved.");
    await Promise.all([
      p2pAlert(t.seller_id, t.id, `Trade expired — the buyer didn't pay in time. Your ${t.crypto_amount} ${t.asset} is unreserved.`),
      p2pAlert(t.buyer_id, t.id, `Your trade for ${t.crypto_amount} ${t.asset} expired — the payment window ran out.`),
    ]);
    return { ...t, status: "cancelled" };
  }
  if ((t.status === "open" || t.status === "paid") && !t.flagged_reason) {
    const bal = await pocketBalance(t.seller_id, t.asset as P2pAsset);
    const others = await lockedAmount(t.seller_id, t.asset, t.id);
    if (bal !== null && bal + 1e-8 < others + Number(t.crypto_amount)) {
      const reason = `Seller's trading pocket dropped to ${bal} ${t.asset} — below the reserved amount.`;
      await supabaseAdmin.from("p2p_trades").update({ flagged_reason: reason }).eq("id", t.id);
      await systemMessage(t.id, `⚠ ${reason} Do NOT send payment until this clears. If you already paid, open a dispute.`);
      await Promise.all([
        p2pAlert(t.buyer_id, t.id, `⚠ Trade flagged: ${reason} Don't send payment until it clears.`),
        p2pAlert(t.seller_id, t.id, `⚠ Your trade was flagged: ${reason} Put the coins back in your trading pocket.`),
      ]);
      return { ...t, flagged_reason: reason };
    }
  }
  return t;
}

/** Send the seller's coins to the buyer and mark the trade released. */
export async function releaseTrade(tradeId: string, actorId: string, resolution?: string) {
  const { data: t } = await supabaseAdmin.from("p2p_trades").select("*").eq("id", tradeId).maybeSingle();
  if (!t) throw new Error("Trade not found");
  if (!["open", "paid", "disputed"].includes(t.status)) throw new Error(`Trade is ${t.status}`);
  const sent = await withdrawAsset(
    t.seller_id,
    legFor(t.asset as P2pAsset),
    t.buyer_address,
    Number(t.crypto_amount),
  );
  await supabaseAdmin
    .from("p2p_trades")
    .update({
      status: "released",
      released_at: new Date().toISOString(),
      release_txid: sent.txid,
      resolution: resolution ?? null,
      resolved_by: resolution ? actorId : null,
    })
    .eq("id", t.id);
  await systemMessage(t.id, `Released ${t.crypto_amount} ${t.asset} to the buyer. Transaction ${sent.txid}`);
  await Promise.all([
    p2pAlert(t.buyer_id, t.id, `✅ ${t.crypto_amount} ${t.asset} is on its way to your wallet.\nTx: <code>${sent.txid}</code>`),
    p2pAlert(t.seller_id, t.id, `✅ You released ${t.crypto_amount} ${t.asset} for $${Number(t.fiat_amount).toFixed(2)}. Trade complete.`),
  ]);
  return sent.txid;
}

/* --------------------------------- scoring -------------------------------- */

export type SellerStats = {
  trades: number;
  completionRate: number;
  positive: number;
  negative: number;
  avgReleaseMin: number | null;
  avgResponseMin: number | null;
  volumeUsd: number;
  flags: number;
  disputesLost: number;
  score: number;
};

export async function statsFor(userIds: string[]): Promise<Record<string, SellerStats>> {
  const out: Record<string, SellerStats> = {};
  if (userIds.length === 0) return out;
  const [{ data: trades }, { data: fb }] = await Promise.all([
    supabaseAdmin
      .from("p2p_trades")
      .select("seller_id, status, fiat_amount, created_at, seller_seen_at, paid_at, released_at, flagged_reason, resolution")
      .in("seller_id", userIds),
    supabaseAdmin.from("p2p_feedback").select("to_id, positive").in("to_id", userIds),
  ]);
  for (const id of userIds) {
    const mine = (trades ?? []).filter((t) => t.seller_id === id);
    const done = mine.filter((t) => t.status === "released");
    const lost = mine.filter((t) => t.resolution === "release_by_arbitration").length;
    const sellerFault = mine.filter((t) => t.resolution === "seller_cancelled").length + lost;
    const finished = done.length + sellerFault;
    const rel = done
      .filter((t) => t.paid_at && t.released_at)
      .map((t) => (new Date(t.released_at!).getTime() - new Date(t.paid_at!).getTime()) / 60000);
    const resp = mine
      .filter((t) => t.seller_seen_at)
      .map((t) => (new Date(t.seller_seen_at!).getTime() - new Date(t.created_at).getTime()) / 60000);
    const pos = (fb ?? []).filter((f) => f.to_id === id && f.positive).length;
    const neg = (fb ?? []).filter((f) => f.to_id === id && !f.positive).length;
    const flags = mine.filter((t) => t.flagged_reason).length;
    const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
    const avgRelease = avg(rel);
    const completion = finished ? done.length / finished : 1;
    const fbRate = (pos + 1) / (pos + neg + 2);
    const speed = avgRelease === null ? 0.5 : Math.max(0, 1 - avgRelease / 60);
    const exp = Math.min(1, Math.log10(done.length + 1) / 2);
    const score = Math.max(
      0,
      Math.round(40 * completion + 30 * fbRate + 20 * speed + 10 * exp - 15 * flags - 10 * lost),
    );
    out[id] = {
      trades: done.length,
      completionRate: completion,
      positive: pos,
      negative: neg,
      avgReleaseMin: avgRelease,
      avgResponseMin: avg(resp),
      volumeUsd: done.reduce((s, t) => s + Number(t.fiat_amount), 0),
      flags,
      disputesLost: lost,
      score: Math.min(100, score),
    };
  }
  return out;
}

/** Marketplace ranking: trust score, plus verified funds we can actually reach, plus speed. */
export function rankOf(stats: SellerStats, verifiedUsd: number) {
  const funds = 15 * Math.min(1, Math.log10(verifiedUsd + 1) / 5);
  const speed = stats.avgResponseMin === null ? 0 : 10 * Math.max(0, 1 - stats.avgResponseMin / 15);
  return stats.score + funds + speed;
}

/* ------------------------------ market prices ----------------------------- */

/** Live USD reference price for a P2P asset. TSD is the platform dollar (1:1). */
export async function marketPrice(asset: P2pAsset): Promise<number | null> {
  if (asset === "TSD") return 1;
  const { fetchQuotes, TRACKED } = await import("./cmc.server");
  const q = await fetchQuotes(TRACKED);
  const p = q.quotes.find((x) => x.symbol === asset)?.price ?? null;
  if (p && p > 0) return p;
  return asset === "USDC" || asset === "USDT" ? 1 : null;
}

/** The price an offer trades at right now: fixed, or market ± the seller's margin. */
export async function effectivePrice(o: { asset: string; price: unknown; price_mode?: string | null; margin_pct?: unknown }) {
  if (o.price_mode !== "market") return Number(o.price);
  const m = await marketPrice(o.asset as P2pAsset);
  if (!m) return Number(o.price); // feed down: fall back to the seller's last saved price
  return +(m * (1 + Number(o.margin_pct ?? 0) / 100)).toFixed(8);
}

/* ------------------------------ telegram alerts --------------------------- */

const SITE = "https://seeds.honest.money";

export async function p2pAlert(userId: string, tradeId: string, text: string) {
  const { notifyUser } = await import("./telegram.server");
  await notifyUser(userId, "notify_p2p", `🌱 <b>Seeds P2P</b>\n${text}\n\n<a href="${SITE}/p2p/trade/${tradeId}">Open the trade</a>`);
}
