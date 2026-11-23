import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/admin-guard";
import { THOR_MARKET_SLUGS } from "@/lib/markets/thor-markets";
import { AD_ACCENTS, AD_SPOTS, ADVERTISER_KINDS, SPOT_INFO, safeAdLink, type Ad } from "./ad-rules";

/*
 * Sponsored spots. Visitors read running ads through the public, column-limited
 * policy (no internal note, no creator). Only admins create, edit, pause or end
 * ads, and only here: the browser has no write access to ad_placements.
 */

const PUBLIC_COLS = "id, spot, advertiser, advertiser_kind, title, body, cta_label, link, coin_slug, accent, starts_at, ends_at";

// Finished values only (never a pending promise): see src/lib/AGENTS.md.
let memo: { at: number; ads: Ad[] } | null = null;
const MEMO_MS = 30_000;

export type LiveAds = { ads: Ad[]; nowMs: number };

/** Every ad running right now (a short list). Pages pick their spots with adsForSpot. */
export const getLiveAds = createServerFn({ method: "GET" }).handler(async (): Promise<LiveAds> => {
  const nowMs = Date.now();
  if (memo && nowMs - memo.at < MEMO_MS) return { ads: memo.ads, nowMs };
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const sb = createClient(process.env.SUPABASE_URL!, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data, error } = await sb.from("ad_placements").select(PUBLIC_COLS).order("starts_at", { ascending: true }).limit(200);
    if (error) throw error;
    const ads = (data ?? []) as Ad[];
    memo = { at: nowMs, ads };
    return { ads, nowMs };
  } catch (e) {
    console.error("[ads] live read failed", e instanceof Error ? e.message : e);
    // Paid ads are optional page decoration: an outage shows Seeds' own notes instead.
    return { ads: memo?.ads ?? [], nowMs };
  }
});

export type AdminAd = Ad & {
  paused: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
  stats: { views: number; clicks: number; views7: number; clicks7: number };
};

export const listAdsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminAd[]> => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("ad_placements")
      .select(`${PUBLIC_COLS}, paused, note, created_at, updated_at`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error("Couldn't load the ads.");
    const ids = (data ?? []).map((a) => a.id);
    const stats = new Map<string, AdminAd["stats"]>();
    if (ids.length) {
      const { data: rows } = await supabaseAdmin.from("ad_daily_stats").select("ad_id, day, views, clicks").in("ad_id", ids).limit(20_000);
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
      for (const r of rows ?? []) {
        const s = stats.get(r.ad_id) ?? { views: 0, clicks: 0, views7: 0, clicks7: 0 };
        s.views += r.views; s.clicks += r.clicks;
        if (r.day >= weekAgo) { s.views7 += r.views; s.clicks7 += r.clicks; }
        stats.set(r.ad_id, s);
      }
    }
    return (data ?? []).map((a) => ({ ...(a as unknown as Omit<AdminAd, "stats">), stats: stats.get(a.id) ?? { views: 0, clicks: 0, views7: 0, clicks7: 0 } }));
  });

const isoDate = z.string().refine((s) => Number.isFinite(Date.parse(s)), "Pick a valid date.");

const adInput = z.object({
  id: z.string().uuid().optional(),
  spot: z.enum(AD_SPOTS),
  advertiser: z.string().trim().min(1).max(80),
  advertiser_kind: z.enum(ADVERTISER_KINDS),
  title: z.string().trim().min(1).max(90),
  body: z.string().trim().max(200),
  cta_label: z.string().trim().min(1).max(30),
  link: z.string().trim().min(1).max(500),
  coin_slug: z.enum(THOR_MARKET_SLUGS).nullable(),
  accent: z.enum(AD_ACCENTS),
  starts_at: isoDate,
  ends_at: isoDate.nullable(),
  note: z.string().trim().max(500).nullable(),
});

export const saveAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const link = safeAdLink(data.link);
    if (!link) throw new Error("The link must be a Seeds page (like /flight-school) or an https:// address.");
    const starts = new Date(data.starts_at).toISOString();
    const ends = data.ends_at ? new Date(data.ends_at).toISOString() : null;
    if (ends && Date.parse(ends) <= Date.parse(starts)) throw new Error("The end has to be after the start.");
    const row = {
      spot: data.spot,
      advertiser: data.advertiser,
      advertiser_kind: data.advertiser_kind,
      title: data.title,
      body: data.body,
      cta_label: data.cta_label,
      link,
      coin_slug: SPOT_INFO[data.spot].coinTargeted ? data.coin_slug : null,
      accent: data.accent,
      starts_at: starts,
      ends_at: ends,
      note: data.note || null,
      updated_at: new Date().toISOString(),
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const res = data.id
      ? await supabaseAdmin.from("ad_placements").update(row).eq("id", data.id).select("id").maybeSingle()
      : await supabaseAdmin.from("ad_placements").insert({ ...row, created_by: context.userId }).select("id").maybeSingle();
    if (res.error || !res.data) throw new Error("Couldn't save the ad.");
    memo = null;
    return { ok: true, id: res.data.id };
  });

/** Pause, resume, or end now. Ads are never deleted, so their view and click record stays. */
export const setAdState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), action: z.enum(["pause", "resume", "end"]) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const patch =
      data.action === "pause" ? { paused: true, updated_at: now }
      : data.action === "resume" ? { paused: false, updated_at: now }
      : { ends_at: now, updated_at: now };
    let q = supabaseAdmin.from("ad_placements").update(patch).eq("id", data.id);
    // Ending an ad that hasn't started yet would break the end-after-start rule: move its start back too.
    if (data.action === "end") {
      const { data: cur } = await supabaseAdmin.from("ad_placements").select("starts_at").eq("id", data.id).maybeSingle();
      if (cur && Date.parse(cur.starts_at) >= Date.now()) {
        q = supabaseAdmin.from("ad_placements").update({ ...patch, starts_at: new Date(Date.now() - 1000).toISOString() }).eq("id", data.id);
      }
    }
    const { error } = await q;
    if (error) throw new Error("Couldn't change the ad.");
    memo = null;
    return { ok: true };
  });
