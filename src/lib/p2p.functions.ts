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
        side: z.enum(["sell", "buy"]).default("sell"),
        asset: z.enum(P2P_ASSET_IDS).optional(),
        method: z.string().max(60).optional(),
        amount: z.number().positive().optional(),
        onlineOnly: z.boolean().optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    let q = db
      .from("p2p_offers")
      .select("id, seller_id, side, asset, price, price_mode, margin_pct, fee_pct, min_fiat, max_fiat, payment_methods, terms, window_minutes, verified_balance, verified_at, new_buyer_max_fiat, min_counterparty_trades")
      .eq("active", true)
      .eq("side", data.side)
      .limit(200);
    if (data.asset) q = q.eq("asset", data.asset);
    if (data.method) q = q.contains("payment_methods", [data.method]);
    const { data: offers } = await q;
    let rows = offers ?? [];

    const owners = [...new Set(rows.map((o) => o.seller_id))];
    const { data: profs } = owners.length
      ? await db.from("p2p_profiles").select("user_id, away, last_seen_at").in("user_id", owners)
      : { data: [] as { user_id: string; away: boolean; last_seen_at: string | null }[] };
    const { data: hme } = owners.length
      ? await db.from("profiles").select("id, hm_member_id, hm_status").in("id", owners)
      : { data: [] as { id: string; hm_member_id: string | null; hm_status: string }[] };
    const presence = (id: string) => {
      const p = profs?.find((x) => x.user_id === id);
      return { away: Boolean(p?.away), lastSeen: p?.last_seen_at ?? null, online: onlineNow(p?.last_seen_at) && !p?.away };
    };
    // Seller tool: ads auto-pause while the owner is set to Away.
    rows = rows.filter((o) => !presence(o.seller_id).away);

    const { refreshOffer, statsFor, rankOf, effectivePrice } = await engine();
    const livePrice: Record<string, number> = {};
    await Promise.all(rows.map(async (o) => { livePrice[o.id] = await effectivePrice(o); }));
    if (data.side === "sell") {
      const stale = rows
        .filter((o) => !o.verified_at || Date.now() - new Date(o.verified_at).getTime() > 5 * 60_000)
        .slice(0, 8);
      await Promise.all(
        stale.map(async (o) => {
          const v = await refreshOffer(o.id).catch(() => null);
          if (v !== null) o.verified_balance = v;
        }),
      );
    }

    const stats = await statsFor(owners);
    const names = await namesFor(owners);
    let list = rows.map((o) => {
      const price = livePrice[o.id];
      const verified = Number(o.verified_balance);
      const availableUsd = data.side === "sell" ? verified * price : Number(o.max_fiat);
      const maxFiat = Math.min(Number(o.max_fiat), availableUsd);
      const s = stats[o.seller_id];
      const pr = presence(o.seller_id);
      const h = hme?.find((x) => x.id === o.seller_id);
      return {
        id: o.id,
        side: o.side as "sell" | "buy",
        asset: o.asset as P2pAsset,
        price,
        priceMode: o.price_mode as "fixed" | "market",
        marginPct: Number(o.margin_pct),
        feePct: Number(o.fee_pct),
        minFiat: Number(o.min_fiat),
        maxFiat,
        methods: o.payment_methods,
        terms: o.terms,
        windowMinutes: o.window_minutes,
        verified,
        availableUsd,
        newBuyerMax: Number(o.new_buyer_max_fiat),
        minTrades: o.min_counterparty_trades,
        seller: {
          handle: names[o.seller_id],
          stats: s,
          online: pr.online,
          lastSeen: pr.lastSeen,
          hmeMember: Boolean(h?.hm_member_id) && h?.hm_status === "active",
        },
        rank: rankOf(s, availableUsd) + (pr.online ? 8 : 0),
      };
    });
    list = list.filter((o) => o.availableUsd >= o.minFiat);
    if (data.onlineOnly) list = list.filter((o) => o.seller.online);
    if (data.amount) list = list.filter((o) => data.amount! >= o.minFiat && data.amount! <= o.maxFiat);
    list.sort((a, b) => b.rank - a.rank);
    return list;
  });

function onlineNow(lastSeen?: string | null) {
  return Boolean(lastSeen && Date.now() - new Date(lastSeen).getTime() < 10 * 60_000);
}

async function touchSeen(userId: string) {
  const db = await admin();
  await db.from("p2p_profiles").update({ last_seen_at: new Date().toISOString() }).eq("user_id", userId);
}

/** Completed P2P trades (either side) — used for new-buyer limits and first-trade warnings. */
async function completedCount(userId: string) {
  const db = await admin();
  const { count } = await db
    .from("p2p_trades")
    .select("id", { count: "exact", head: true })
    .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
    .eq("status", "released");
  return count ?? 0;
}

async function isBlockedPair(a: string, b: string) {
  const db = await admin();
  const { data } = await db
    .from("p2p_blocks")
    .select("blocker_id")
    .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`)
    .limit(1);
  return Boolean(data?.length);
}
export const getP2pMarketPrices = createServerFn({ method: "GET" }).handler(async () => {
  const { marketPrice } = await engine();
  const out: Record<string, number | null> = {};
  await Promise.all(P2P_ASSET_IDS.map(async (a) => { out[a] = await marketPrice(a); }));
  return out;
});

export const getSellerProfile = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ handle: z.string().min(1).max(40) }).parse(i))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: p } = await db.from("p2p_profiles").select("*").ilike("handle", data.handle).maybeSingle();
    if (!p) return null;
    const { statsFor, effectivePrice } = await engine();
    const [stats, { data: offers }, { data: fb }, { data: history }] = await Promise.all([
      statsFor([p.user_id]),
      db
        .from("p2p_offers")
        .select("id, asset, price, price_mode, margin_pct, fee_pct, min_fiat, max_fiat, payment_methods, verified_balance, window_minutes")
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
      offers: await Promise.all(
        (offers ?? []).map(async (o) => ({ ...o, price: await effectivePrice(o), verified_balance: Number(o.verified_balance) })),
      ),
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
        priceMode: (o.price_mode === "market" ? "market" : "fixed") as "fixed" | "market",
        marginPct: Number(o.margin_pct),
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
        priceMode: z.enum(["fixed", "market"]).default("fixed"),
        marginPct: z.number().min(-50).max(50).default(0),
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
      price_mode: data.priceMode,
      margin_pct: data.marginPct,
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
        /** Only when answering a buy ad: the responding seller's payment instructions. */
        instructions: z.string().trim().max(2000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const me = context.userId;
    const { data: o } = await db
      .from("p2p_offers")
      .select("*, p2p_offer_instructions(instructions)")
      .eq("id", data.offerId)
      .eq("active", true)
      .maybeSingle();
    if (!o) throw new Error("Ad is no longer available");
    if (o.seller_id === me) throw new Error("You can't trade with your own ad");
    if (!o.payment_methods.includes(data.method)) throw new Error("That payment method isn't on this ad");
    if (data.fiat < Number(o.min_fiat) || data.fiat > Number(o.max_fiat))
      throw new Error(`Amount must be between $${o.min_fiat} and $${o.max_fiat}`);
    if (await isBlockedPair(me, o.seller_id)) throw new Error("You can't trade with this user");

    const buyAd = o.side === "buy";
    const sellerId = buyAd ? me : o.seller_id;
    const buyerId = buyAd ? o.seller_id : me;

    // Trust & safety: ad owner's requirements for the person responding.
    const myCount = await completedCount(me);
    if (myCount < o.min_counterparty_trades)
      throw new Error(`This trader only works with people who have ${o.min_counterparty_trades}+ completed trades (you have ${myCount})`);
    const newBuyerMax = Number(o.new_buyer_max_fiat);
    if (!buyAd && newBuyerMax > 0 && myCount < 3 && data.fiat > newBuyerMax)
      throw new Error(`New buyers can spend up to $${newBuyerMax} with this seller until they finish 3 trades`);

    const asset = o.asset as P2pAsset;
    let to = buyAd ? undefined : data.buyerAddress;
    if (!to) {
      const { data: w } = await db.from("wallets").select("txc_address, evm_address").eq("user_id", buyerId).maybeSingle();
      to = (P2P_ASSETS[asset].family === "evm" ? w?.evm_address : w?.txc_address) ?? undefined;
    }
    if (!to) throw new Error(buyAd ? "The buyer hasn't set up a wallet yet" : "Set up your wallet first so we know where to send your coins");

    let instructions = (o.p2p_offer_instructions as { instructions: string } | null)?.instructions ?? "";
    if (buyAd) {
      const { data: prof } = await db.from("p2p_profiles").select("payment_details").eq("user_id", me).maybeSingle();
      const saved = (prof?.payment_details as Record<string, string> | null)?.[data.method] ?? "";
      instructions = (data.instructions || saved).trim();
      if (instructions.length < 5) throw new Error("Add your payment instructions so the buyer knows how to pay you");
      if (data.instructions) {
        const next = { ...((prof?.payment_details as Record<string, string>) ?? {}), [data.method]: data.instructions };
        await db.from("p2p_profiles").update({ payment_details: next }).eq("user_id", me);
      }
    }

    const feePct = Number(o.fee_pct);
    const { effectivePrice, p2pAlert, pocketBalance, lockedAmount, systemMessage } = await engine();
    const price = await effectivePrice(o);
    const feeFiat = +(data.fiat * (feePct / 100)).toFixed(2);
    const crypto = +((data.fiat - feeFiat) / price).toFixed(P2P_ASSETS[asset].decimals);

    // Lock: the seller's pocket must cover this trade on top of everything already reserved.
    const [bal, locked] = await Promise.all([pocketBalance(sellerId, asset), lockedAmount(sellerId, asset)]);
    if (bal === null) throw new Error(buyAd ? "We couldn't read your trading pocket — authorize it on the Wallet page first" : "We couldn't verify the seller's funds right now — try another seller");
    if (bal - locked + 1e-8 < crypto) throw new Error(buyAd ? "Your trading pocket doesn't have enough for that amount" : "The seller doesn't have enough verified funds for that amount");

    const { data: t, error } = await db
      .from("p2p_trades")
      .insert({
        offer_id: o.id,
        seller_id: sellerId,
        buyer_id: buyerId,
        asset,
        price,
        fee_pct: feePct,
        crypto_amount: crypto,
        fiat_amount: data.fiat,
        fee_fiat: feeFiat,
        payment_method: data.method,
        instructions,
        buyer_address: to,
        expires_at: new Date(Date.now() + o.window_minutes * 60_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await systemMessage(
      t.id,
      `Trade opened. ${crypto} ${asset} is reserved in the seller's trading pocket. Buyer: pay $${data.fiat.toFixed(2)} by ${data.method} within ${o.window_minutes} minutes, then tap "I've paid".`,
    );
    if (!buyAd && o.auto_reply?.trim()) {
      await db.from("p2p_messages").insert({ trade_id: t.id, sender_id: o.seller_id, body: o.auto_reply.trim() });
    }
    await touchSeen(me);
    if (buyAd) {
      await p2pAlert(buyerId, t.id, `🤝 A seller answered your buy ad: ${crypto} ${asset} for $${data.fiat.toFixed(2)} by ${data.method}. Coins are reserved — open the trade to see how to pay.`);
    } else {
      await p2pAlert(sellerId, t.id, `🛒 New buyer! They want ${crypto} ${asset} for $${data.fiat.toFixed(2)} by ${data.method}. ${crypto} ${asset} is reserved in your pocket — keep an eye on your account.`);
    }
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
      db.from("p2p_messages").select("id, sender_id, body, created_at, attachment_path, attachment_name").eq("trade_id", t.id).order("created_at"),
      db.from("p2p_feedback").select("from_id, positive, comment").eq("trade_id", t.id),
      db.from("p2p_dispute_votes").select("vote").eq("trade_id", t.id),
    ]);
    const names = await namesFor([t.seller_id, t.buyer_id, ...(msgs ?? []).map((m) => m.sender_id ?? "")]);
    const paths = (msgs ?? []).map((m) => m.attachment_path).filter((p): p is string => Boolean(p));
    const signed: Record<string, string> = {};
    if (paths.length) {
      const { data: urls } = await db.storage.from("p2p-receipts").createSignedUrls(paths, 3600);
      for (const u of urls ?? []) if (u.path && u.signedUrl) signed[u.path] = u.signedUrl;
    }
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
        file: m.attachment_path
          ? { name: m.attachment_name ?? "receipt", url: signed[m.attachment_path] ?? null, image: /\.(png|jpe?g|webp|gif)$/i.test(m.attachment_path) }
          : null,
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
    const { p2pAlert } = await engine();
    const other = context.userId === t.seller_id ? t.buyer_id : t.seller_id;
    await p2pAlert(other, t.id, `💬 New message: ${escapeHtml(data.body.slice(0, 200))}`);
    return { ok: true };
  });

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const UPLOAD_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

/** Upload a payment receipt / screenshot into the trade chat. Only the two parties (and admins) can see it. */
export const uploadP2pReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(120),
        type: z.string().max(60),
        base64: z.string().min(1).max(11_500_000), // ~8 MB
        note: z.string().trim().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const ext = UPLOAD_TYPES[data.type];
    if (!ext) throw new Error("Upload a photo (PNG, JPG, WebP, GIF) or a PDF");
    const { db, t } = await loadForParty(data.id, context.userId, context.supabase);
    if (t.status === "released" || t.status === "cancelled") throw new Error("This trade is closed");
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (bytes.byteLength > 8 * 1024 * 1024) throw new Error("File is over 8 MB");
    const path = `${t.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await db.storage.from("p2p-receipts").upload(path, bytes, { contentType: data.type });
    if (error) throw new Error(error.message);
    await db.from("p2p_messages").insert({
      trade_id: t.id,
      sender_id: context.userId,
      body: data.note || "📎 Attached a file",
      attachment_path: path,
      attachment_name: data.name,
    });
    const { p2pAlert } = await engine();
    const other = context.userId === t.seller_id ? t.buyer_id : t.seller_id;
    await p2pAlert(other, t.id, `📎 ${context.userId === t.buyer_id ? "The buyer" : "The seller"} uploaded a file (${escapeHtml(data.name)}).`);
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
    const { systemMessage, releaseTrade, p2pAlert } = await engine();
    const now = new Date().toISOString();

    if (data.action === "paid") {
      if (me !== t.buyer_id || t.status !== "open") throw new Error("Only the buyer can mark an open trade paid");
      await db.from("p2p_trades").update({ status: "paid", paid_at: now }).eq("id", t.id);
      await systemMessage(t.id, "Buyer marked the payment as sent. Seller: check your account, then release.");
      await p2pAlert(t.seller_id, t.id, `💵 The buyer says they sent $${Number(t.fiat_amount).toFixed(2)} by ${t.payment_method}. Check your account, then release ${t.crypto_amount} ${t.asset}.`);
    } else if (data.action === "cancel") {
      if (t.status !== "open" && !(t.status === "paid" && me === t.seller_id))
        throw new Error("This trade can't be cancelled now — open a dispute instead");
      if (t.status === "paid" && me === t.seller_id) throw new Error("Buyer says they paid — open a dispute instead");
      const resolution = me === t.buyer_id ? "buyer_cancelled" : "seller_cancelled";
      await db.from("p2p_trades").update({ status: "cancelled", cancelled_at: now, resolution }).eq("id", t.id);
      await systemMessage(t.id, `Trade cancelled by the ${me === t.buyer_id ? "buyer" : "seller"}. Coins unreserved.`);
      await p2pAlert(me === t.buyer_id ? t.seller_id : t.buyer_id, t.id, `❌ The ${me === t.buyer_id ? "buyer" : "seller"} cancelled the ${t.crypto_amount} ${t.asset} trade.`);
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
        "Dispute opened. Coins stay reserved. Upload your proof (receipts, screenshots) in the chat — the community jury and Seeds admins will review.",
      );
      await p2pAlert(me === t.buyer_id ? t.seller_id : t.buyer_id, t.id, `⚖️ A dispute was opened: ${escapeHtml(data.reason || "no reason given")}. Upload your proof in the trade chat.`);
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
    const { data: rt } = await db.from("p2p_trades").select("seller_id, buyer_id").eq("id", data.id).maybeSingle();
    if (rt) {
      const { p2pAlert } = await engine();
      await Promise.all([
        p2pAlert(rt.seller_id, data.id, "⚖️ Dispute ruled in your favor — trade cancelled, your coins stay with you."),
        p2pAlert(rt.buyer_id, data.id, "⚖️ Dispute ruled for the seller — the trade was cancelled."),
      ]);
    }
    return { ok: true };
  });
