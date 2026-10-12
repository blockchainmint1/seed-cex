import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { P2P_ASSET_IDS, P2P_ASSETS, type P2pAsset } from "@/lib/p2p-config";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;
const engine = () => import("./p2p.server");

async function namesFor(ids: string[]) {
  const db = await admin();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return {} as Record<string, string>;
  const [{ data: p2p }, { data: prof }] = await Promise.all([
    db.from("p2p_profiles").select("user_id, handle").in("user_id", uniq),
    db.from("profiles").select("id, display_name").in("id", uniq),
  ]);
  const out: Record<string, string> = {};
  for (const id of uniq) {
    out[id] =
      p2p?.find((p) => p.user_id === id)?.handle ??
      prof?.find((p) => p.id === id)?.display_name ??
      "anon";
  }
  return out;
}

async function isAdmin(supabase: { from: (t: "user_roles") => any }, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  return Boolean(data);
}

/* --------------------------------- public --------------------------------- */

export const listOffers = createServerFn({ method: "GET" })
  .inputValidator((i) =>
    z
      .object({
        asset: z.enum(P2P_ASSET_IDS).optional(),
        method: z.string().max(60).optional(),
        amount: z.number().positive().optional(),
        protectedOnly: z.boolean().optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    let q = db
      .from("p2p_offers")
      .select("id, seller_id, asset, price, fee_pct, min_fiat, max_fiat, payment_methods, terms, window_minutes, verified_balance, verified_at")
      .eq("active", true)
      .limit(200);
    if (data.asset) q = q.eq("asset", data.asset);
    if (data.method) q = q.contains("payment_methods", [data.method]);
    const { data: offers } = await q;
    let rows = offers ?? [];

    // Refresh stale verified balances (bounded so the page stays fast).
    const { refreshOffer, statsFor, rankOf } = await engine();
    const stale = rows
      .filter((o) => !o.verified_at || Date.now() - new Date(o.verified_at).getTime() > 5 * 60_000)
      .slice(0, 8);
    await Promise.all(
      stale.map(async (o) => {
        const v = await refreshOffer(o.id).catch(() => null);
        if (v !== null) o.verified_balance = v;
      }),
    );

    const stats = await statsFor([...new Set(rows.map((o) => o.seller_id))]);
    const names = await namesFor(rows.map((o) => o.seller_id));
    let list = rows.map((o) => {
      const price = Number(o.price);
      const verified = Number(o.verified_balance);
      const availableUsd = verified * price;
      const maxFiat = Math.min(Number(o.max_fiat), availableUsd);
      const s = stats[o.seller_id];
      return {
        id: o.id,
        asset: o.asset as P2pAsset,
        price,
        feePct: Number(o.fee_pct),
        minFiat: Number(o.min_fiat),
        maxFiat,
        methods: o.payment_methods,
        terms: o.terms,
        windowMinutes: o.window_minutes,
        verified,
        availableUsd,
        seller: { handle: names[o.seller_id], stats: s },
        rank: rankOf(s, availableUsd),
      };
    });
    list = list.filter((o) => o.availableUsd >= o.minFiat);
    if (data.amount) list = list.filter((o) => data.amount! >= o.minFiat && data.amount! <= o.maxFiat);
    list.sort((a, b) => b.rank - a.rank);
    return list;
  });

export const getSellerProfile = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ handle: z.string().min(1).max(40) }).parse(i))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: p } = await db.from("p2p_profiles").select("*").ilike("handle", data.handle).maybeSingle();
    if (!p) return null;
    const { statsFor } = await engine();
    const [stats, { data: offers }, { data: fb }, { data: history }] = await Promise.all([
      statsFor([p.user_id]),
      db
        .from("p2p_offers")
        .select("id, asset, price, fee_pct, min_fiat, max_fiat, payment_methods, verified_balance, window_minutes")
        .eq("seller_id", p.user_id)
        .eq("active", true),
      db.from("p2p_feedback").select("from_id, positive, comment, created_at").eq("to_id", p.user_id).order("created_at", { ascending: false }).limit(50),
      db
        .from("p2p_trades")
        .select("asset, crypto_amount, fiat_amount, payment_method, status, created_at, paid_at, released_at")
        .eq("seller_id", p.user_id)
        .in("status", ["released", "cancelled"])
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    const names = await namesFor((fb ?? []).map((f) => f.from_id));
    return {
      handle: p.handle,
      bio: p.bio,
      location: p.location,
      languages: p.languages,
      hours: p.hours,
      since: p.created_at,
      stats: stats[p.user_id],
      offers: (offers ?? []).map((o) => ({ ...o, price: Number(o.price), verified_balance: Number(o.verified_balance) })),
      feedback: (fb ?? []).map((f) => ({ by: names[f.from_id], positive: f.positive, comment: f.comment, at: f.created_at })),
      history: (history ?? []).map((h) => ({
        asset: h.asset,
        fiat: Math.round(Number(h.fiat_amount) / 10) * 10, // rounded for privacy
        method: h.payment_method,
        status: h.status,
        at: h.created_at,
        releaseMin:
          h.paid_at && h.released_at
            ? (new Date(h.released_at).getTime() - new Date(h.paid_at).getTime()) / 60000
            : null,
      })),
    };
  });

/* ---------------------------------- seller --------------------------------- */

export const getMyP2p = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const me = context.userId;
    const [{ data: profile }, { data: offers }, { data: trades }, { data: wallet }] = await Promise.all([
      db.from("p2p_profiles").select("*").eq("user_id", me).maybeSingle(),
      db.from("p2p_offers").select("*, p2p_offer_instructions(instructions)").eq("seller_id", me).order("created_at", { ascending: false }),
      db
        .from("p2p_trades")
        .select("id, seller_id, buyer_id, asset, crypto_amount, fiat_amount, payment_method, status, flagged_reason, created_at")
        .or(`seller_id.eq.${me},buyer_id.eq.${me}`)
        .order("created_at", { ascending: false })
        .limit(100),
      db.from("wallets").select("txc_address, evm_address").eq("user_id", me).maybeSingle(),
    ]);
    const { statsFor } = await engine();
    const names = await namesFor((trades ?? []).flatMap((t) => [t.seller_id, t.buyer_id]));
    return {
      profile,
      stats: (await statsFor([me]))[me],
      hasWallet: Boolean(wallet?.txc_address),
      offers: (offers ?? []).map((o) => ({
        id: o.id,
        asset: o.asset as P2pAsset,
        price: Number(o.price),
        feePct: Number(o.fee_pct),
        minFiat: Number(o.min_fiat),
        maxFiat: Number(o.max_fiat),
        methods: o.payment_methods,
        terms: o.terms,
        windowMinutes: o.window_minutes,
        active: o.active,
        verified: Number(o.verified_balance),
        instructions: (o.p2p_offer_instructions as { instructions: string } | null)?.instructions ?? "",
      })),
      trades: (trades ?? []).map((t) => ({
        id: t.id,
        role: t.seller_id === me ? ("seller" as const) : ("buyer" as const),
        counterparty: names[t.seller_id === me ? t.buyer_id : t.seller_id],
        asset: t.asset,
        crypto: Number(t.crypto_amount),
        fiat: Number(t.fiat_amount),
        method: t.payment_method,
        status: t.status,
        flagged: Boolean(t.flagged_reason),
        at: t.created_at,
      })),
    };
  });

export const saveP2pProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        handle: z.string().trim().regex(/^[a-zA-Z0-9_-]{3,24}$/, "3–24 letters, numbers, - or _"),
        bio: z.string().max(600),
        location: z.string().max(80),
        languages: z.array(z.string().max(30)).max(8),
        hours: z.string().max(80),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: taken } = await db.from("p2p_profiles").select("user_id").ilike("handle", data.handle).maybeSingle();
    if (taken && taken.user_id !== context.userId) throw new Error("That handle is taken");
    const { error } = await db
      .from("p2p_profiles")
      .upsert({ user_id: context.userId, ...data, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid().optional(),
        asset: z.enum(P2P_ASSET_IDS),
        price: z.number().positive().max(10_000_000),
        feePct: z.number().min(0).max(20),
        minFiat: z.number().min(1),
        maxFiat: z.number().min(1).max(1_000_000),
        methods: z.array(z.string().trim().min(1).max(60)).min(1).max(10),
        instructions: z.string().trim().min(5).max(2000),
        terms: z.string().max(1000),
        windowMinutes: z.number().int().min(10).max(240),
        active: z.boolean(),
      })
      .refine((d) => d.maxFiat >= d.minFiat, "Max must be at least the min")
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: prof } = await db.from("p2p_profiles").select("user_id").eq("user_id", context.userId).maybeSingle();
    if (!prof) throw new Error("Create your seller profile first");
    const row = {
      seller_id: context.userId,
      asset: data.asset,
      price: data.price,
      fee_pct: data.feePct,
      min_fiat: data.minFiat,
      max_fiat: data.maxFiat,
      payment_methods: data.methods,
      terms: data.terms,
      window_minutes: data.windowMinutes,
      active: data.active,
      updated_at: new Date().toISOString(),
    };
    let id = data.id;
    if (id) {
      const { error } = await db.from("p2p_offers").update(row).eq("id", id).eq("seller_id", context.userId);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await db.from("p2p_offers").insert(row).select("id").single();
      if (error) throw new Error(error.message);
      id = ins.id;
    }
    await db.from("p2p_offer_instructions").upsert({ offer_id: id!, instructions: data.instructions });
    const { refreshOffer } = await engine();
    const verified = await refreshOffer(id!).catch(() => 0);
    return { id, verified };
  });

/* ---------------------------------- trades --------------------------------- */

export const openTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        offerId: z.string().uuid(),
        fiat: z.number().positive(),
        method: z.string().min(1).max(60),
        buyerAddress: z.string().trim().max(120).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: o } = await db
      .from("p2p_offers")
      .select("*, p2p_offer_instructions(instructions)")
      .eq("id", data.offerId)
      .eq("active", true)
      .maybeSingle();
    if (!o) throw new Error("Offer is no longer available");
    if (o.seller_id === context.userId) throw new Error("You can't buy from yourself");
    if (!o.payment_methods.includes(data.method)) throw new Error("Seller doesn't accept that method");
    if (data.fiat < Number(o.min_fiat) || data.fiat > Number(o.max_fiat))
      throw new Error(`Amount must be between $${o.min_fiat} and $${o.max_fiat}`);

    const asset = o.asset as P2pAsset;
    let to = data.buyerAddress;
    if (!to) {
      const { data: w } = await db.from("wallets").select("txc_address, evm_address").eq("user_id", context.userId).maybeSingle();
      to = (P2P_ASSETS[asset].family === "evm" ? w?.evm_address : w?.txc_address) ?? undefined;
    }
    if (!to) throw new Error("Set up your wallet first so we know where to send your coins");

    const feePct = Number(o.fee_pct);
    const price = Number(o.price);
    const feeFiat = +(data.fiat * (feePct / 100)).toFixed(2);
    const crypto = +((data.fiat - feeFiat) / price).toFixed(P2P_ASSETS[asset].decimals);

    // Lock: the pocket must cover this trade on top of everything already reserved.
    const { pocketBalance, lockedAmount, systemMessage } = await engine();
    const [bal, locked] = await Promise.all([pocketBalance(o.seller_id, asset), lockedAmount(o.seller_id, asset)]);
    if (bal === null) throw new Error("We couldn't verify the seller's funds right now — try another seller");
    if (bal - locked + 1e-8 < crypto) throw new Error("The seller doesn't have enough verified funds for that amount");

    const { data: t, error } = await db
      .from("p2p_trades")
      .insert({
        offer_id: o.id,
        seller_id: o.seller_id,
        buyer_id: context.userId,
        asset,
        price,
        fee_pct: feePct,
        crypto_amount: crypto,
        fiat_amount: data.fiat,
        fee_fiat: feeFiat,
        payment_method: data.method,
        instructions: (o.p2p_offer_instructions as { instructions: string } | null)?.instructions ?? "",
        buyer_address: to,
        expires_at: new Date(Date.now() + o.window_minutes * 60_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await systemMessage(
      t.id,
      `Trade opened. ${crypto} ${asset} is reserved in the seller's trading pocket. Pay $${data.fiat.toFixed(2)} by ${data.method} within ${o.window_minutes} minutes, then tap "I've paid".`,
    );
    return { id: t.id };
  });

async function loadForParty(tradeId: string, userId: string, supabase: any) {
  const db = await admin();
  const { watchTrade } = await engine();
  const t = await watchTrade(tradeId);
  if (!t) throw new Error("Trade not found");
  const party = t.seller_id === userId || t.buyer_id === userId;
  const isAdm = await isAdmin(supabase, userId);
  if (!party && !isAdm) throw new Error("Forbidden");
  return { db, t, isAdm };
}

export const getP2pTrade = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { db, t, isAdm } = await loadForParty(data.id, context.userId, context.supabase);
    const me = context.userId;
    if (me === t.seller_id && !t.seller_seen_at) {
      await db.from("p2p_trades").update({ seller_seen_at: new Date().toISOString() }).eq("id", t.id);
    }
    const [{ data: msgs }, { data: fb }, { data: votes }] = await Promise.all([
      db.from("p2p_messages").select("id, sender_id, body, created_at").eq("trade_id", t.id).order("created_at"),
      db.from("p2p_feedback").select("from_id, positive, comment").eq("trade_id", t.id),
      db.from("p2p_dispute_votes").select("vote").eq("trade_id", t.id),
    ]);
    const names = await namesFor([t.seller_id, t.buyer_id, ...(msgs ?? []).map((m) => m.sender_id ?? "")]);
    const { statsFor } = await engine();
    const st = await statsFor([t.seller_id]);
    return {
      id: t.id,
      role: me === t.seller_id ? "seller" : me === t.buyer_id ? "buyer" : "admin",
      isAdmin: isAdm,
      asset: t.asset,
      price: Number(t.price),
      feePct: Number(t.fee_pct),
      feeFiat: Number(t.fee_fiat),
      crypto: Number(t.crypto_amount),
      fiat: Number(t.fiat_amount),
      method: t.payment_method,
      instructions: t.instructions,
      buyerAddress: t.buyer_address,
      status: t.status,
      flagged: t.flagged_reason,
      expiresAt: t.expires_at,
      paidAt: t.paid_at,
      releasedAt: t.released_at,
      releaseTxid: t.release_txid,
      disputeReason: t.dispute_reason,
      resolution: t.resolution,
      seller: { handle: names[t.seller_id], stats: st[t.seller_id] },
      buyer: names[t.buyer_id],
      messages: (msgs ?? []).map((m) => ({
        id: m.id,
        mine: m.sender_id === me,
        system: m.sender_id === null,
        who: m.sender_id ? names[m.sender_id] : "Seeds",
        body: m.body,
        at: m.created_at,
      })),
      myFeedback: (fb ?? []).find((f) => f.from_id === me) ?? null,
      votes: {
        release: (votes ?? []).filter((v) => v.vote === "release").length,
        refund: (votes ?? []).filter((v) => v.vote === "refund").length,
      },
    };
  });

export const sendP2pMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), body: z.string().trim().min(1).max(1000) }).parse(i))
  .handler(async ({ data, context }) => {
    const { db, t } = await loadForParty(data.id, context.userId, context.supabase);
    await db.from("p2p_messages").insert({ trade_id: t.id, sender_id: context.userId, body: data.body });
    return { ok: true };
  });

export const p2pAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["paid", "cancel", "release", "dispute"]),
        reason: z.string().max(1000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { db, t } = await loadForParty(data.id, context.userId, context.supabase);
    const me = context.userId;
    const { systemMessage, releaseTrade } = await engine();
    const now = new Date().toISOString();

    if (data.action === "paid") {
      if (me !== t.buyer_id || t.status !== "open") throw new Error("Only the buyer can mark an open trade paid");
      await db.from("p2p_trades").update({ status: "paid", paid_at: now }).eq("id", t.id);
      await systemMessage(t.id, "Buyer marked the payment as sent. Seller: check your account, then release.");
    } else if (data.action === "cancel") {
      if (t.status !== "open" && !(t.status === "paid" && me === t.seller_id))
        throw new Error("This trade can't be cancelled now — open a dispute instead");
      if (t.status === "paid" && me === t.seller_id) throw new Error("Buyer says they paid — open a dispute instead");
      const resolution = me === t.buyer_id ? "buyer_cancelled" : "seller_cancelled";
      await db.from("p2p_trades").update({ status: "cancelled", cancelled_at: now, resolution }).eq("id", t.id);
      await systemMessage(t.id, `Trade cancelled by the ${me === t.buyer_id ? "buyer" : "seller"}. Coins unreserved.`);
    } else if (data.action === "release") {
      if (me !== t.seller_id) throw new Error("Only the seller can release");
      return { txid: await releaseTrade(t.id, me) };
    } else {
      if (!["open", "paid"].includes(t.status)) throw new Error("Nothing to dispute");
      if (me === t.buyer_id && t.status !== "paid") throw new Error("Mark the trade paid before opening a dispute");
      await db
        .from("p2p_trades")
        .update({ status: "disputed", dispute_reason: data.reason ?? "", disputed_by: me })
        .eq("id", t.id);
      await systemMessage(
        t.id,
        "Dispute opened. Coins stay reserved. Post your proof (receipts, screenshots described in text) in the chat — the community jury and Seeds admins will review.",
      );
    }
    return { ok: true };
  });

export const leaveFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid(), positive: z.boolean(), comment: z.string().max(400) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { db, t } = await loadForParty(data.id, context.userId, context.supabase);
    if (!["released", "cancelled"].includes(t.status)) throw new Error("Feedback opens once the trade ends");
    const to = context.userId === t.seller_id ? t.buyer_id : t.seller_id;
    const { error } = await db.from("p2p_feedback").insert({
      trade_id: t.id,
      from_id: context.userId,
      to_id: to,
      positive: data.positive,
      comment: data.comment,
    });
    if (error) throw new Error(error.code === "23505" ? "You already left feedback" : error.message);
    return { ok: true };
  });

/* --------------------------------- disputes -------------------------------- */

export const listDisputes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const me = context.userId;
    const [{ count }, isAdm] = await Promise.all([
      db.from("p2p_trades").select("id", { count: "exact", head: true }).or(`seller_id.eq.${me},buyer_id.eq.${me}`).eq("status", "released"),
      isAdmin(context.supabase, me),
    ]);
    const eligible = isAdm || (count ?? 0) >= 3;
    const { data: ds } = await db
      .from("p2p_trades")
      .select("id, seller_id, buyer_id, asset, crypto_amount, fiat_amount, payment_method, dispute_reason, disputed_by, flagged_reason, created_at, paid_at")
      .eq("status", "disputed")
      .order("created_at");
    const ids = (ds ?? []).map((d) => d.id);
    const [{ data: votes }, { data: msgs }] = await Promise.all([
      ids.length ? db.from("p2p_dispute_votes").select("trade_id, voter_id, vote, note").in("trade_id", ids) : Promise.resolve({ data: [] as any[] }),
      ids.length ? db.from("p2p_messages").select("trade_id, sender_id, body, created_at").in("trade_id", ids).order("created_at") : Promise.resolve({ data: [] as any[] }),
    ]);
    const names = await namesFor((ds ?? []).flatMap((d) => [d.seller_id, d.buyer_id]));
    return {
      eligible,
      isAdmin: isAdm,
      completedTrades: count ?? 0,
      disputes: (ds ?? [])
        .filter((d) => d.seller_id !== me && d.buyer_id !== me)
        .map((d) => {
          const v = (votes ?? []).filter((x) => x.trade_id === d.id);
          return {
            id: d.id,
            seller: names[d.seller_id],
            buyer: names[d.buyer_id],
            openedBy: d.disputed_by === d.buyer_id ? "buyer" : "seller",
            asset: d.asset,
            crypto: Number(d.crypto_amount),
            fiat: Number(d.fiat_amount),
            method: d.payment_method,
            reason: d.dispute_reason,
            flagged: d.flagged_reason,
            paidAt: d.paid_at,
            release: v.filter((x) => x.vote === "release").length,
            refund: v.filter((x) => x.vote === "refund").length,
            myVote: v.find((x) => x.voter_id === me)?.vote ?? null,
            notes: isAdm ? v.map((x) => ({ vote: x.vote, note: x.note })) : [],
            chat: eligible
              ? (msgs ?? [])
                  .filter((m) => m.trade_id === d.id)
                  .map((m) => ({
                    who: m.sender_id === null ? "Seeds" : m.sender_id === d.seller_id ? "Seller" : "Buyer",
                    body: m.body,
                    at: m.created_at,
                  }))
              : [],
          };
        }),
    };
  });

export const voteDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid(), vote: z.enum(["release", "refund"]), note: z.string().max(500) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const me = context.userId;
    const { data: t } = await db.from("p2p_trades").select("seller_id, buyer_id, status").eq("id", data.id).maybeSingle();
    if (!t || t.status !== "disputed") throw new Error("Dispute is closed");
    if (t.seller_id === me || t.buyer_id === me) throw new Error("You can't judge your own trade");
    const [{ count }, isAdm] = await Promise.all([
      db.from("p2p_trades").select("id", { count: "exact", head: true }).or(`seller_id.eq.${me},buyer_id.eq.${me}`).eq("status", "released"),
      isAdmin(context.supabase, me),
    ]);
    if (!isAdm && (count ?? 0) < 3) throw new Error("Jurors need 3 completed P2P trades");
    const { error } = await db
      .from("p2p_dispute_votes")
      .upsert({ trade_id: data.id, voter_id: me, vote: data.vote, note: data.note }, { onConflict: "trade_id,voter_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resolveDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), outcome: z.enum(["release", "refund"]) }).parse(i))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.supabase, context.userId))) throw new Error("Admins only");
    const db = await admin();
    const { releaseTrade, systemMessage } = await engine();
    if (data.outcome === "release") {
      return { txid: await releaseTrade(data.id, context.userId, "release_by_arbitration") };
    }
    await db
      .from("p2p_trades")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        resolution: "refund_by_arbitration",
        resolved_by: context.userId,
      })
      .eq("id", data.id)
      .eq("status", "disputed");
    await systemMessage(data.id, "Arbitration ruled for the seller: trade cancelled, coins stay with the seller.");
    return { ok: true };
  });
