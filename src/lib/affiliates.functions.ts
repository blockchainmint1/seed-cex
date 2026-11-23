import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "./admin-guard";
import {
  MAX_TSD_MEMBERS, affiliateSort, cleanCode, fillDays, isSharing, periodDays, sortAffiliates, type AffiliateRow,
} from "./affiliates";


const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/**
 * Signed in: the invite code this browser arrived with, sent once after sign-up.
 * The server records it only for an account that joined within the referral window.
 */
export const recordSignupReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => ({ code: cleanCode(d?.code) }))
  .handler(async ({ data, context }) => {
    if (!data.code) return { result: "no_code" };
    const { recordReferral } = await import("./affiliates.server");
    return { result: await recordReferral(context.userId, data.code, "after_signup") };
  });

type ActivityRow = { user_id: string; trades: number; traded_value: number | string; swaps: number; swap_usd: number | string; last_activity: string | null };
async function activityFor(ids: string[]) {
  const out = new Map<string, { trades: number; tradedValue: number; swaps: number; swapUsd: number; lastActivity: string | null }>();
  if (!ids.length) return out;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("admin_member_activity", { _ids: ids });
  for (const r of (data ?? []) as ActivityRow[])
    out.set(r.user_id, { trades: r.trades, tradedValue: Number(r.traded_value), swaps: r.swaps, swapUsd: Number(r.swap_usd), lastActivity: r.last_activity });
  return out;
}

async function namesFor(ids: string[]) {
  const out = new Map<string, string | null>();
  if (!ids.length) return out;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await supabaseAdmin.from("profiles").select("id, display_name").in("id", ids.slice(i, i + 500));
    for (const p of data ?? []) out.set(p.id, p.display_name);
  }
  return out;
}

/** Admin → Affiliates: totals, new members per day, and every invite code with what it brought in. */
export const getAdminAffiliates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number; sort?: string }) => ({ days: periodDays(d?.days), sort: affiliateSort(d?.sort) }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const from = since(data.days);
    const chartDays = Math.min(data.days, 90);
    const chartFrom = since(chartDays);
    const head = { count: "exact" as const, head: true };
    const [aff, newAll, newPeriod, refAll, refPeriod, joins, refs] = await Promise.all([
      supabaseAdmin.rpc("admin_affiliates", { _since: from }),
      supabaseAdmin.from("profiles").select("id", head),
      supabaseAdmin.from("profiles").select("id", head).gte("created_at", from),
      supabaseAdmin.from("referrals").select("user_id", head),
      supabaseAdmin.from("referrals").select("user_id", head).gte("recorded_at", from),
      supabaseAdmin.from("profiles").select("created_at").gte("created_at", chartFrom).order("created_at").limit(20_000),
      supabaseAdmin.from("referrals").select("recorded_at").gte("recorded_at", chartFrom).limit(20_000),
    ]);
    if (aff.error) throw new Error("Couldn't load affiliates.");
    type Raw = { code_lc: string; code: string; owner_id: string | null; link_seen_at: string | null; clicks_all: number; clicks_since: number; signups_all: number; signups_since: number; active_members: number; trades: number; traded_value: number | string; swaps: number; swap_usd: number | string; ignite_paid: number; ignite_started: number };
    const raw = (aff.data ?? []) as Raw[];
    const names = await namesFor([...new Set(raw.map((r) => r.owner_id).filter((x): x is string => !!x))]);
    const rows: AffiliateRow[] = raw.map((r) => ({
      code: r.code, ownerId: r.owner_id, ownerName: r.owner_id ? names.get(r.owner_id) ?? null : null, linkSeenAt: r.link_seen_at,
      clicksAll: Number(r.clicks_all), clicksPeriod: Number(r.clicks_since), signupsAll: Number(r.signups_all), signupsPeriod: Number(r.signups_since),
      activeMembers: Number(r.active_members), trades: Number(r.trades), tradedValue: Number(r.traded_value), swaps: Number(r.swaps), swapUsd: Number(r.swap_usd),
      ignitePaid: Number(r.ignite_paid), igniteStarted: Number(r.ignite_started),
    }));
    const perDay = new Map<string, { day: string; total: number; referred: number }>();
    const bump = (iso: string, k: "total" | "referred") => {
      const d = iso.slice(0, 10);
      const e = perDay.get(d) ?? { day: d, total: 0, referred: 0 };
      e[k] += 1; perDay.set(d, e);
    };
    for (const p of joins.data ?? []) bump(p.created_at, "total");
    for (const r of refs.data ?? []) bump(r.recorded_at, "referred");
    return {
      days: data.days,
      totals: {
        membersAll: newAll.count ?? 0, membersPeriod: newPeriod.count ?? 0,
        referredAll: refAll.count ?? 0, referredPeriod: refPeriod.count ?? 0,
        clicksPeriod: rows.reduce((s, r) => s + r.clicksPeriod, 0),
        sharingPeriod: rows.filter(isSharing).length,
        linksOpened: rows.filter((r) => r.ownerId).length,
        ignitePaidByRef: rows.reduce((s, r) => s + r.ignitePaid, 0),
      },
      series: fillDays([...perDay.values()], chartDays),
      affiliates: sortAffiliates(rows, data.sort),
    };
  });

/** TSD held by the members each code brought in (codes on screen; at most MAX_TSD_MEMBERS members read). */
export const getAdminAffiliateTsd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { codes: string[] }) => ({
    codes: [...new Set((Array.isArray(d?.codes) ? d.codes : []).map(cleanCode).filter((c): c is string => !!c).map((c) => c.toLowerCase()))].slice(0, 100),
  }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    if (!data.codes.length) return { byCode: {} as Record<string, number>, partial: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: refs } = await supabaseAdmin.from("referrals").select("user_id, code_lc").in("code_lc", data.codes).order("recorded_at", { ascending: false }).limit(MAX_TSD_MEMBERS + 1);
    const list = (refs ?? []).slice(0, MAX_TSD_MEMBERS);
    const { readTsdBalances } = await import("./pockets/tsd-balances.server");
    const bal = await readTsdBalances(list.map((r) => r.user_id));
    const byCode: Record<string, number> = {};
    for (const r of list) byCode[r.code_lc!] = (byCode[r.code_lc!] ?? 0) + (bal[r.user_id] ?? 0);
    return { byCode, partial: (refs ?? []).length > MAX_TSD_MEMBERS };
  });

export type AdminNewMember = {
  userId: string; name: string | null; joinedAt: string; code: string | null; referrerName: string | null; source: string | null;
  trades: number; tradedValue: number; swaps: number; swapUsd: number; lastActivity: string | null; linked: boolean;
};

/** New members (newest first), optionally only referred ones or one code's members. TSD is read separately for rows on screen. */
export const getAdminNewMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number; referredOnly?: boolean; code?: string | null; offset?: number }) => ({
    days: periodDays(d?.days), referredOnly: d?.referredOnly === true, code: cleanCode(d?.code)?.toLowerCase() ?? null,
    offset: Math.max(0, Math.min(1_000_000, Math.floor(Number(d?.offset) || 0))),
  }))
  .handler(async ({ data, context }): Promise<{ total: number; offset: number; rows: AdminNewMember[] }> => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const LIMIT = 50;
    let ids: string[]; let total: number;
    const refMap = new Map<string, { code: string; source: string }>();
    if (data.code || data.referredOnly) {
      // Referred members: page the referrals list (a code's members are shown for all time).
      let q = supabaseAdmin.from("referrals").select("user_id, code, source", { count: "exact" });
      q = data.code ? q.eq("code_lc", data.code) : q.gte("recorded_at", since(data.days));
      const { data: refs, count } = await q.order("recorded_at", { ascending: false }).range(data.offset, data.offset + LIMIT - 1);
      for (const r of refs ?? []) refMap.set(r.user_id, { code: r.code, source: r.source });
      ids = (refs ?? []).map((r) => r.user_id); total = count ?? 0;
    } else {
      const { data: profs, count } = await supabaseAdmin.from("profiles").select("id", { count: "exact" })
        .gte("created_at", since(data.days)).order("created_at", { ascending: false }).range(data.offset, data.offset + LIMIT - 1);
      ids = (profs ?? []).map((p) => p.id); total = count ?? 0;
      if (ids.length) {
        const { data: refs } = await supabaseAdmin.from("referrals").select("user_id, code, source").in("user_id", ids);
        for (const r of refs ?? []) refMap.set(r.user_id, { code: r.code, source: r.source });
      }
    }
    if (!ids.length) return { total, offset: data.offset, rows: [] };
    const codesLc = [...new Set([...refMap.values()].map((r) => r.code.toLowerCase()))];
    const [{ data: profs }, { data: owners }, { data: links }, act] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, created_at").in("id", ids),
      codesLc.length ? supabaseAdmin.from("referral_codes").select("code_lc, user_id").in("code_lc", codesLc) : Promise.resolve({ data: [] as { code_lc: string; user_id: string }[] }),
      supabaseAdmin.from("hme_links").select("user_id").eq("status", "active").in("user_id", ids),
      activityFor(ids),
    ]);
    const ownerOf = new Map((owners ?? []).map((o) => [o.code_lc, o.user_id]));
    const ownerNames = await namesFor([...new Set([...ownerOf.values()])]);
    const linked = new Set((links ?? []).map((l) => l.user_id));
    const prof = new Map((profs ?? []).map((p) => [p.id, p]));
    const rows = ids.map((id): AdminNewMember => {
      const p = prof.get(id); const r = refMap.get(id); const a = act.get(id);
      const owner = r ? ownerOf.get(r.code.toLowerCase()) : undefined;
      return {
        userId: id, name: p?.display_name ?? null, joinedAt: p?.created_at ?? "", code: r?.code ?? null,
        referrerName: owner ? ownerNames.get(owner) ?? null : null, source: r?.source ?? null,
        trades: a?.trades ?? 0, tradedValue: a?.tradedValue ?? 0, swaps: a?.swaps ?? 0, swapUsd: a?.swapUsd ?? 0,
        lastActivity: a?.lastActivity ?? null, linked: linked.has(id),
      };
    });
    return { total, offset: data.offset, rows };
  });

