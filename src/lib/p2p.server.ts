/**
 * Peer-to-peer marketplace engine ("lock + watch").
 *
 * Sellers keep coins in their own authorized trading pocket. When a buyer opens
 * a trade we reserve that amount against the pocket's live on-chain balance and
 * keep re-checking it; if the pocket drops below what's reserved the trade is
 * flagged and the seller's score takes the hit. Release sends straight from the
 * seller's HME pocket to the buyer, only after the seller taps Approve in Telegram.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { LegId } from "@/lib/chains";
import { P2P_ASSETS, type P2pAsset } from "@/lib/p2p-config";

export const LIVE_STATUSES = ["open", "paid", "disputed"] as const;

export function legFor(asset: P2pAsset): LegId {
  return P2P_ASSETS[asset].leg;
}

/**
 * Live balance in the seller's HME trading pocket, or null when the pocket can't
 * send yet (no instant-access link, two-factor after the link, no Telegram) or
 * can't be read. A pocket that can't send never counts as verified liquidity.
 */
export async function pocketBalance(sellerId: string, asset: P2pAsset): Promise<number | null> {
  return (await pocketStatus(sellerId, asset)).balance;
}

/** Balance plus the plain reason it isn't usable (for the seller's own desk). */
export async function pocketStatus(sellerId: string, asset: P2pAsset): Promise<{ balance: number | null; blocker: string | null }> {
  const { pocketSender, pocketLegBalance } = await import("@/lib/pocket-send/pocket.server");
  const leg = legFor(asset);
  const s = await pocketSender(sellerId, leg);
  if (!s.ok) return { balance: null, blocker: s.reason };
  // Balance only: P2P reserves the coin itself; the actual send re-checks fees.
  const b = await pocketLegBalance(s.address, leg, 0, { balanceOnly: true });
  return { balance: b.balance, blocker: b.balance === null ? (b.reason ?? "Couldn't read your pocket") : null };
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

/**
 * Release step 1: ask the seller to approve the send in Telegram. Nothing moves
 * here. Returns once the request is out; the send happens when they tap Approve.
 */
export async function releaseTrade(tradeId: string, actorId: string, resolution?: string) {
  const { data: t } = await supabaseAdmin.from("p2p_trades").select("*").eq("id", tradeId).maybeSingle();
  if (!t) throw new Error("Trade not found");
  if (!["open", "paid", "disputed"].includes(t.status)) throw new Error(`Trade is ${t.status}`);
  // A frozen seller's own release waits for the team; a release ordered by a dispute ruling may go ahead.
  if (!resolution) {
    const { tradingFrozenReason } = await import("@/lib/settle/confirm.server");
    const frozen = await tradingFrozenReason(t.seller_id);
    if (frozen) throw new Error(actorId === t.seller_id ? frozen : "The seller's account is on hold for a team review. Open a dispute so the team can sort out this trade.");
  }
  const leg = legFor(t.asset as P2pAsset);
  const { pocketSender, pocketLegBalance, coverProblem, validDestination } = await import("@/lib/pocket-send/pocket.server");
  const s = await pocketSender(t.seller_id, leg);
  if (!s.ok) throw new Error(actorId === t.seller_id ? s.reason : `The seller's pocket can't send yet: ${s.reason}`);
  if (!(await validDestination(leg, t.buyer_address))) throw new Error("The buyer's receiving address isn't valid for this coin");
  const amount = Number(t.crypto_amount);
  const problem = coverProblem(leg, await pocketLegBalance(s.address, leg, amount), amount);
  if (problem) throw new Error(problem);

  const { requestSendApproval } = await import("@/lib/pocket-send/approvals.server");
  const ap = await requestSendApproval({
    userId: t.seller_id, linkId: s.link.id, purpose: "p2p_release", refId: t.id, leg, amount,
    from: s.address, to: t.buyer_address,
    what: resolution ? "P2P trade · released by Seeds after a dispute review" : `P2P sale · $${Number(t.fiat_amount).toFixed(2)}`,
    meta: { resolution: resolution ?? null, actor_id: actorId },
  });
  await systemMessage(t.id, "Release requested — waiting for the seller to approve the send in Telegram.");
  return { pending: true as const, approvalId: ap.id, expiresAt: ap.expires_at };
}

/**
 * Release step 2 (after a Telegram decision): send if approved, or tell both sides
 * it didn't happen. Safe to call more than once.
 */
export async function continueP2pRelease(tradeId: string) {
  const { data: t } = await supabaseAdmin.from("p2p_trades").select("*").eq("id", tradeId).maybeSingle();
  if (!t) return null;
  const leg = legFor(t.asset as P2pAsset);
  const { latestApprovals, spendApproval, recordApprovalTx, recordApprovalError } = await import("@/lib/pocket-send/approvals.server");
  const ap = (await latestApprovals("p2p_release", t.id))[leg];
  if (!ap) return null;

  if (ap.status === "declined" || ap.status === "expired" || ap.status === "cancelled") {
    if (!["open", "paid", "disputed"].includes(t.status)) return null;
    const word = ap.status === "declined" ? "declined" : ap.status === "expired" ? "wasn't approved in time" : "was cancelled";
    await systemMessage(t.id, `The release ${word === "declined" ? "was declined" : word} in Telegram. Nothing was sent; the coins stay reserved.`);
    await p2pAlert(t.seller_id, t.id, `The release of ${t.crypto_amount} ${t.asset} ${word === "declined" ? "was declined" : word}. Nothing was sent. Tap Release on the trade page when you're ready.`);
    return null;
  }
  if (ap.status !== "approved") return null;
  if (!["open", "paid", "disputed"].includes(t.status)) return null;
  const resolved = Boolean(ap.meta?.resolution);
  if (!resolved) {
    const { tradingFrozenReason } = await import("@/lib/settle/confirm.server");
    if (await tradingFrozenReason(t.seller_id)) {
      await systemMessage(t.id, "Release paused: the seller's account is on hold for a team review. Nothing was sent; the coins stay reserved.");
      return null;
    }
  }

  const { pocketSender, sendFromPocket } = await import("@/lib/pocket-send/pocket.server");
  const s = await pocketSender(t.seller_id, leg);
  if (!s.ok) {
    await p2pAlert(t.seller_id, t.id, `Couldn't release ${t.crypto_amount} ${t.asset}: ${s.reason}`);
    return null;
  }
  const amount = Number(t.crypto_amount);
  const spent = await spendApproval({ purpose: "p2p_release", refId: t.id, leg, userId: t.seller_id, linkId: s.link.id, amount, from: s.address, to: t.buyer_address })
    .catch(() => null);
  if (!spent) return null; // another worker already took it
  let sent: { txid: string };
  try {
    sent = await sendFromPocket({ link: s.link, leg, from: s.address, to: t.buyer_address, amount, record: (txid) => recordApprovalTx(spent.id, txid) });
    await recordApprovalTx(spent.id, sent.txid);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Send failed";
    await recordApprovalError(spent.id, msg);
    await systemMessage(t.id, `Release failed: ${msg} Nothing was sent.`);
    await p2pAlert(t.seller_id, t.id, `⚠ Release of ${t.crypto_amount} ${t.asset} failed: ${msg}`);
    return null;
  }
  const resolution = (spent.meta?.resolution as string | null | undefined) ?? null;
  const actorId = (spent.meta?.actor_id as string | null | undefined) ?? t.seller_id;
  await supabaseAdmin
    .from("p2p_trades")
    .update({
      status: "released",
      released_at: new Date().toISOString(),
      release_txid: sent.txid,
      resolution,
      resolved_by: resolution ? actorId : null,
    })
    .eq("id", t.id)
    .in("status", ["open", "paid", "disputed"]);
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
