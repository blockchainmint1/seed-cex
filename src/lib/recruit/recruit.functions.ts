import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/admin-guard";
import { PACKAGE_IDS } from "@/lib/listing";
import {
  AI_DRAFTS_PER_DAY, CHANNELS, GOAL_BY, LEAD_EXCHANGES, STAGES, canMoveStage, dedupeKey, listingGoal, perMonthToGoal,
  outreachProblems, parsePastedLeads, scoreLead, stageAfterSend, type Channel, type ScoreReason, type Source, type Stage,
} from "./recruit-rules";

/*
 * Admin → Recruiting. Every function checks admin (role + fresh authenticator code).
 * The recruit_* tables are server-only. Seeds never sends outreach itself: an admin
 * copies an approved message, sends it, then marks it sent here.
 */

type Ctx = Parameters<typeof requireAdmin>[0];
async function admin(context: unknown) {
  await requireAdmin(context as Ctx);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const LIST_COLS = "id, name, symbol, chain, source, source_detail, market_cap_usd, volume_24h_usd, num_market_pairs, score, stage, website, twitter, telegram, email, last_contacted_at, created_at, updated_at";

export type LeadRow = {
  id: string; name: string; symbol: string; chain: string | null; source: Source; source_detail: string | null;
  market_cap_usd: number | null; volume_24h_usd: number | null; num_market_pairs: number | null; score: number; stage: Stage;
  website: string | null; twitter: string | null; telegram: string | null; email: string | null;
  last_contacted_at: string | null; created_at: string; updated_at: string;
  application: string | null;
};

/* --------------------------------- overview -------------------------------- */

export const getRecruitOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context);
    const head = { count: "exact" as const, head: true };
    const since = new Date(Date.now() - 864e5).toISOString();
    const [stageCounts, total, gradeA, drafts, sent, apps, live] = await Promise.all([
      Promise.all(STAGES.map(async (s) => [s, (await db.from("recruit_leads").select("id", head).eq("stage", s)).count ?? 0] as const)),
      db.from("recruit_leads").select("id", head),
      db.from("recruit_leads").select("id", head).gte("score", 75).not("stage", "in", "(passed,declined,dead)"),
      db.from("recruit_messages").select("id", head).eq("ai_written", true).gte("created_at", since),
      db.from("recruit_messages").select("id", head).eq("status", "sent"),
      db.from("listing_applications").select("id", head),
      db.from("listing_applications").select("package, amount_usd, payment_status").eq("status", "live").limit(10_000),
    ]);
    const approved = await db.from("listing_applications").select("id", head).eq("status", "approved");
    const liveRows = live.data ?? [];
    // Paid = live on Seeds, plus leads an admin moved to Paid that aren't live yet.
    const paidCount = liveRows.length + (Object.fromEntries(stageCounts).paid ?? 0);
    // What teams actually paid (after promo codes); refunded listings count nothing.
    const earnedUsd = liveRows.reduce((s, r) => s + (r.payment_status === "paid" ? Number(r.amount_usd) : 0), 0);
    const prices = await (await import("@/lib/listing-pay.server")).livePrices();
    return {
      stages: Object.fromEntries(stageCounts) as Record<Stage, number>,
      total: total.count ?? 0,
      gradeA: gradeA.count ?? 0,
      messagesSent: sent.count ?? 0,
      aiDraftsLeft: Math.max(0, AI_DRAFTS_PER_DAY - (drafts.count ?? 0)),
      applications: apps.count ?? 0,
      listingsLive: liveRows.length,
      approvedWaiting: approved.count ?? 0,
      earnedUsd,
      goal: (() => {
        const g = listingGoal(paidCount, PACKAGE_IDS.map((id) => prices[id]));
        return { ...g, by: GOAL_BY, perMonth: perMonthToGoal(g.remaining, Date.now(), GOAL_BY) };
      })(),
      exchanges: LEAD_EXCHANGES.map((e) => ({ ...e })),
    };
  });

/* ---------------------------------- list ---------------------------------- */

const listInput = z.object({
  stage: z.enum(["all", "open", ...STAGES]).default("open"),
  grade: z.enum(["all", "A", "B", "C", "D"]).default("all"),
  q: z.string().trim().max(60).default(""),
  sort: z.enum(["score", "newest", "volume", "updated"]).default("score"),
  page: z.number().int().min(0).max(10_000).default(0),
  size: z.number().int().min(10).max(200).default(50),
});

const GRADE_RANGE = { A: [75, 100], B: [55, 74], C: [35, 54], D: [0, 34] } as const;

export const listRecruitLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listInput.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<{ rows: LeadRow[]; total: number }> => {
    const db = await admin(context);
    let q = db.from("recruit_leads").select(LIST_COLS, { count: "exact" });
    if (data.stage === "open") q = q.not("stage", "in", "(passed,declined,dead,live)");
    else if (data.stage !== "all") q = q.eq("stage", data.stage);
    if (data.grade !== "all") { const [lo, hi] = GRADE_RANGE[data.grade]; q = q.gte("score", lo).lte("score", hi); }
    if (data.q) {
      const s = data.q.replace(/[%,()*]/g, " ").trim();
      if (s) q = q.or(`name.ilike.%${s}%,symbol.ilike.%${s}%`);
    }
    const order = { score: "score", newest: "created_at", volume: "volume_24h_usd", updated: "updated_at" }[data.sort];
    q = q.order(order, { ascending: false, nullsFirst: false }).order("id");
    const { data: rows, count, error } = await q.range(data.page * data.size, data.page * data.size + data.size - 1);
    if (error) throw new Error("Couldn't load the leads.");
    const symbols = [...new Set((rows ?? []).map((r) => r.symbol.toUpperCase()))];
    const apps = new Map<string, string>();
    if (symbols.length) {
      const { data: a } = await db.from("listing_applications").select("ticker, status").in("ticker", symbols);
      for (const r of a ?? []) apps.set(r.ticker, r.status);
    }
    return {
      rows: (rows ?? []).map((r) => ({ ...(r as unknown as Omit<LeadRow, "application">), application: apps.get(r.symbol.toUpperCase()) ?? null })),
      total: count ?? 0,
    };
  });

/* --------------------------------- one lead -------------------------------- */

const idInput = z.object({ id: z.string().uuid() });

export const getRecruitLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    const [lead, msgs, events] = await Promise.all([
      db.from("recruit_leads").select("*").eq("id", data.id).maybeSingle(),
      db.from("recruit_messages").select("id, channel, subject, body, ai_written, status, created_by, sent_by, sent_at, created_at, updated_at").eq("lead_id", data.id).order("created_at", { ascending: false }).limit(50),
      db.from("recruit_events").select("id, kind, detail, actor, created_at").eq("lead_id", data.id).order("created_at", { ascending: false }).limit(100),
    ]);
    if (lead.error || !lead.data) throw new Error("That lead doesn't exist.");
    const people = new Set<string>();
    for (const m of msgs.data ?? []) { people.add(m.created_by); if (m.sent_by) people.add(m.sent_by); }
    for (const e of events.data ?? []) if (e.actor) people.add(e.actor);
    const names: Record<string, string> = {};
    if (people.size) {
      const { data: p } = await db.from("profiles").select("id, display_name").in("id", [...people]);
      for (const r of p ?? []) names[r.id] = r.display_name || "Admin";
    }
    const { data: app } = await db.from("listing_applications").select("id, status, package, created_at").eq("ticker", lead.data.symbol.toUpperCase()).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return {
      lead: { ...lead.data, score_reasons: (lead.data.score_reasons ?? []) as ScoreReason[] },
      messages: (msgs.data ?? []).map((m) => ({ ...m, problems: outreachProblems((m.subject ? `${m.subject}\n` : "") + m.body, m.channel as Channel) })),
      events: events.data ?? [],
      names,
      application: app ?? null,
    };
  });

/* ---------------------------------- finding --------------------------------- */

const findInput = z.object({
  source: z.enum(["cmc_new", "cmc_midsize", "exchange"]),
  exchange: z.enum(LEAD_EXCHANGES.map((e) => e.slug) as [string, ...string[]]).optional(),
  limit: z.number().int().min(10).max(200).default(50),
  minVolume: z.number().min(0).max(1e9).default(10_000),
});

type NewLead = Parameters<typeof dedupeKey>[0] & Record<string, unknown>;

/** Insert leads that aren't already in the list; returns how many were new. */
async function insertNew(db: Awaited<ReturnType<typeof admin>>, rows: (NewLead & { dedupe_key: string })[], actor: string, detail: Record<string, unknown>) {
  if (!rows.length) return 0;
  const { data, error } = await db.from("recruit_leads").upsert(rows as never, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id");
  if (error) { console.error("[recruit] insert", error.message); throw new Error("Couldn't save the new leads."); }
  const ids = (data ?? []).map((r) => r.id);
  if (ids.length) await db.from("recruit_events").insert(ids.map((id) => ({ lead_id: id, kind: "found", detail: detail as never, actor })));
  return ids.length;
}

async function existingKeys(db: Awaited<ReturnType<typeof admin>>, keys: string[]) {
  const have = new Set<string>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await db.from("recruit_leads").select("dedupe_key").in("dedupe_key", keys.slice(i, i + 200));
    for (const r of data ?? []) have.add(r.dedupe_key);
  }
  return have;
}

export const findRecruitLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => findInput.parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    if (data.source === "exchange" && !data.exchange) throw new Error("Pick an exchange.");
    const srv = await import("./recruit.server");
    const onSeeds = srv.seedsSymbols();
    const tally = { checked: 0, added: 0, already: 0, onSeeds: 0, notTeam: 0, quiet: 0 };
    const picked: import("./recruit.server").Candidate[] = [];
    const seen = new Set<number>();

    const consider = async (batch: import("./recruit.server").Candidate[]) => {
      const fresh = batch.filter((c) => !seen.has(c.cmcId));
      fresh.forEach((c) => seen.add(c.cmcId));
      tally.checked += fresh.length;
      const have = await existingKeys(db, fresh.map((c) => `cmc:${c.cmcId}`));
      for (const c of fresh) {
        if (picked.length >= data.limit) return;
        if (have.has(`cmc:${c.cmcId}`)) { tally.already++; continue; }
        const k = srv.keepTeam(c, onSeeds);
        if (k === "on_seeds") { tally.onSeeds++; continue; }
        if (k === "not_team") { tally.notTeam++; continue; }
        if ((c.volume24hUsd ?? 0) < data.minVolume) { tally.quiet++; continue; }
        picked.push(c);
      }
    };

    if (data.source === "exchange") {
      const ids = await srv.exchangeCoinIds(data.exchange!);
      const have = await existingKeys(db, ids.map((id) => `cmc:${id}`));
      tally.already += have.size;
      const todo = ids.filter((id) => !have.has(`cmc:${id}`));
      for (let i = 0; i < todo.length && picked.length < data.limit && i < 1000; i += 200) await consider(await srv.quotesFor(todo.slice(i, i + 200)));
    } else {
      const kind = data.source === "cmc_new" ? "new" : "midsize";
      for (let page = 0; page < 6 && picked.length < data.limit; page++) {
        const batch = await srv.listingPage({ kind, minVolume: data.minVolume }, 1 + page * 200);
        if (!batch.length) break;
        await consider(batch);
      }
    }

    const links = picked.length ? await srv.linksFor(picked.map((c) => c.cmcId)) : new Map();
    const now = Date.now();
    const detail = data.source === "exchange" ? data.exchange! : null;
    const rows = picked.map((c) => {
      const l = links.get(c.cmcId) ?? { website: null, twitter: null, telegram: null, discord: null };
      const s = scoreLead({ volume24hUsd: c.volume24hUsd, marketCapUsd: c.marketCapUsd, numMarketPairs: c.numMarketPairs, dateAdded: c.dateAdded, chain: c.chain, native: c.native, website: l.website, twitter: l.twitter, telegram: l.telegram, email: null, sourceDetail: detail }, now);
      return {
        dedupe_key: dedupeKey({ cmcId: c.cmcId, symbol: c.symbol, name: c.name }),
        name: c.name, symbol: c.symbol, cmc_id: c.cmcId, cmc_slug: c.cmcSlug, chain: c.chain, contract: c.contract,
        ...l, source: data.source, source_detail: detail,
        market_cap_usd: c.marketCapUsd, volume_24h_usd: c.volume24hUsd, num_market_pairs: c.numMarketPairs, date_added: c.dateAdded, tags: c.tags,
        score: s.score, score_reasons: s.reasons, facts_at: new Date(now).toISOString(), created_by: context.userId,
      };
    });
    tally.added = await insertNew(db, rows, context.userId, { source: data.source, exchange: detail });
    return tally;
  });

const pasteInput = z.object({ text: z.string().max(100_000), from: z.string().trim().max(60).optional() });

export const importRecruitLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => pasteInput.parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    const { seedsSymbols } = await import("./recruit.server");
    const onSeeds = seedsSymbols();
    const { leads, skipped } = parsePastedLeads(data.text);
    const from = data.from?.toLowerCase() || null;
    const now = Date.now();
    let onSeedsCount = 0;
    const rows = leads.flatMap((l) => {
      if (onSeeds.has(l.symbol)) { onSeedsCount++; return []; }
      const chain = null;
      const s = scoreLead({ volume24hUsd: null, marketCapUsd: null, numMarketPairs: null, dateAdded: null, chain, native: false, website: l.website, twitter: l.twitter, telegram: l.telegram, email: l.email, sourceDetail: from }, now);
      return [{
        dedupe_key: dedupeKey({ symbol: l.symbol, name: l.name, website: l.website, contract: l.contract, chain }),
        name: l.name, symbol: l.symbol, contract: l.contract, website: l.website, twitter: l.twitter, telegram: l.telegram, discord: l.discord, email: l.email,
        source: "paste", source_detail: from, score: s.score, score_reasons: s.reasons, created_by: context.userId,
      }];
    });
    const unique = [...new Map(rows.map((r) => [r.dedupe_key, r])).values()];
    const added = await insertNew(db, unique, context.userId, { source: "paste", from });
    return { read: leads.length, added, already: unique.length - added + (rows.length - unique.length), onSeeds: onSeedsCount, skippedLines: skipped };
  });

/* ---------------------------------- editing --------------------------------- */

const urlOrNull = z.string().trim().max(300).nullable().transform((v) => (v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : null));
const editInput = z.object({
  id: z.string().uuid(),
  stage: z.enum(STAGES).optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  finder: z.string().trim().max(120).nullable().optional(),
  contact_name: z.string().trim().max(120).nullable().optional(),
  email: z.string().trim().max(200).email().nullable().optional().or(z.literal("").transform(() => null)),
  website: urlOrNull.optional(), twitter: urlOrNull.optional(), telegram: urlOrNull.optional(), discord: urlOrNull.optional(),
});

export const updateRecruitLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => editInput.parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    const { data: cur } = await db.from("recruit_leads").select("*").eq("id", data.id).maybeSingle();
    if (!cur) throw new Error("That lead doesn't exist.");
    const { id, stage, ...fields } = data;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const changed: string[] = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      const val = v === "" ? null : v;
      if ((cur as Record<string, unknown>)[k] !== val) { patch[k] = val; changed.push(k); }
    }
    if (stage && stage !== cur.stage) {
      if (!canMoveStage(cur.stage as Stage, stage)) throw new Error(`A lead can't go from ${cur.stage} back to ${stage}.`);
      patch.stage = stage;
    }
    const contactChanged = ["website", "twitter", "telegram", "email"].some((k) => changed.includes(k));
    if (contactChanged) {
      const next = { ...cur, ...patch } as typeof cur;
      const s = scoreLead({
        volume24hUsd: next.volume_24h_usd, marketCapUsd: next.market_cap_usd, numMarketPairs: next.num_market_pairs, dateAdded: next.date_added,
        chain: next.chain, native: !!next.cmc_id && !next.contract, website: next.website, twitter: next.twitter, telegram: next.telegram, email: next.email, sourceDetail: next.source_detail,
      }, Date.now());
      patch.score = s.score; patch.score_reasons = s.reasons;
    }
    if (!changed.length && !patch.stage) return { ok: true };
    // Compare-and-set on the stage we read, so two admins can't both move it.
    const { data: done, error } = await db.from("recruit_leads").update(patch as never).eq("id", id).eq("stage", cur.stage).select("id").maybeSingle();
    if (error || !done) throw new Error("Someone else just changed this lead. Refresh and try again.");
    const events = [];
    if (patch.stage) events.push({ lead_id: id, kind: "stage", detail: { from: cur.stage, to: patch.stage }, actor: context.userId });
    if (changed.length) events.push({ lead_id: id, kind: "edit", detail: { fields: changed }, actor: context.userId });
    if (events.length) await db.from("recruit_events").insert(events as never);
    return { ok: true };
  });

/** Re-read CoinMarketCap's numbers and links for a lead and score it again. */
export const refreshRecruitLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    const { data: cur } = await db.from("recruit_leads").select("*").eq("id", data.id).maybeSingle();
    if (!cur) throw new Error("That lead doesn't exist.");
    if (!cur.cmc_id) throw new Error("This lead isn't on CoinMarketCap, so there's nothing to refresh.");
    const srv = await import("./recruit.server");
    const [[c], links] = await Promise.all([srv.quotesFor([cur.cmc_id]), srv.linksFor([cur.cmc_id])]);
    if (!c) throw new Error("CoinMarketCap no longer lists this coin.");
    const l = links.get(cur.cmc_id);
    // Keep links an admin typed in when CoinMarketCap has none.
    const merged = { website: l?.website ?? cur.website, twitter: l?.twitter ?? cur.twitter, telegram: l?.telegram ?? cur.telegram, discord: l?.discord ?? cur.discord };
    const s = scoreLead({ volume24hUsd: c.volume24hUsd, marketCapUsd: c.marketCapUsd, numMarketPairs: c.numMarketPairs, dateAdded: c.dateAdded, chain: c.chain, native: c.native, ...merged, email: cur.email, sourceDetail: cur.source_detail }, Date.now());
    const now = new Date().toISOString();
    await db.from("recruit_leads").update({ ...merged, market_cap_usd: c.marketCapUsd, volume_24h_usd: c.volume24hUsd, num_market_pairs: c.numMarketPairs, tags: c.tags, score: s.score, score_reasons: s.reasons as never, facts_at: now, updated_at: now }).eq("id", data.id);
    await db.from("recruit_events").insert({ lead_id: data.id, kind: "rescored", detail: { from: cur.score, to: s.score }, actor: context.userId });
    return { score: s.score };
  });

/* ---------------------------------- messages -------------------------------- */

const draftInput = z.object({ id: z.string().uuid(), channel: z.enum(CHANNELS), angle: z.string().trim().max(300).optional() });

export const draftRecruitMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => draftInput.parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    const since = new Date(Date.now() - 864e5).toISOString();
    const { count } = await db.from("recruit_messages").select("id", { count: "exact", head: true }).eq("ai_written", true).gte("created_at", since);
    if ((count ?? 0) >= AI_DRAFTS_PER_DAY) return { ok: false as const, error: `The team has used today's ${AI_DRAFTS_PER_DAY} AI drafts. You can still type a message yourself.` };
    const [{ data: lead }, { data: me }] = await Promise.all([
      db.from("recruit_leads").select("*").eq("id", data.id).maybeSingle(),
      db.from("profiles").select("display_name").eq("id", context.userId).maybeSingle(),
    ]);
    if (!lead) throw new Error("That lead doesn't exist.");
    const sender = me?.display_name?.trim() ? `${me.display_name.trim()}, Seeds` : "The Seeds team";
    const { writeDraft } = await import("./recruit.server");
    try {
      const d = await writeDraft({
        name: lead.name, symbol: lead.symbol, chain: lead.chain, volume24hUsd: lead.volume_24h_usd, marketCapUsd: lead.market_cap_usd,
        numMarketPairs: lead.num_market_pairs, dateAdded: lead.date_added, sourceDetail: lead.source_detail, source: lead.source,
        website: lead.website, contactName: lead.contact_name, notes: lead.notes,
      }, data.channel, sender, data.angle ?? null);
      const { data: row, error } = await db.from("recruit_messages").insert({ lead_id: lead.id, channel: data.channel, subject: d.subject, body: d.body, ai_written: true, created_by: context.userId }).select("id").single();
      if (error) throw new Error("Couldn't save the draft.");
      await db.from("recruit_events").insert({ lead_id: lead.id, kind: "draft", detail: { message: row.id, channel: data.channel, ai: true }, actor: context.userId });
      return { ok: true as const, id: row.id };
    } catch (e) {
      const { GatewayError } = await import("@lovable.dev/ai-gateway");
      if (e instanceof GatewayError) {
        console.error("[recruit] draft failed", e.code, e.httpStatus);
        return { ok: false as const, error: "The AI writer isn't available right now. Try again in a minute, or type the message yourself." };
      }
      throw e;
    }
  });

const writeInput = z.object({
  leadId: z.string().uuid(), id: z.string().uuid().optional(), channel: z.enum(CHANNELS),
  subject: z.string().trim().max(200).nullable(), body: z.string().trim().min(1).max(4000),
});

/** Save a typed message, or edits to a draft. Sent messages are never edited. */
export const saveRecruitMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => writeInput.parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    const now = new Date().toISOString();
    const subject = data.channel === "email" ? data.subject || null : null;
    if (data.id) {
      const { data: done } = await db.from("recruit_messages").update({ channel: data.channel, subject, body: data.body, updated_at: now }).eq("id", data.id).eq("lead_id", data.leadId).eq("status", "draft").select("id").maybeSingle();
      if (!done) throw new Error("Only drafts can be edited.");
      return { id: data.id };
    }
    const { data: row, error } = await db.from("recruit_messages").insert({ lead_id: data.leadId, channel: data.channel, subject, body: data.body, ai_written: false, created_by: context.userId }).select("id").single();
    if (error) throw new Error("Couldn't save the message.");
    await db.from("recruit_events").insert({ lead_id: data.leadId, kind: "draft", detail: { message: row.id, channel: data.channel, ai: false }, actor: context.userId });
    return { id: row.id };
  });

const markInput = z.object({ id: z.string().uuid(), action: z.enum(["sent", "discard"]) });

/** An admin sent this message themselves (or binned the draft). */
export const markRecruitMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => markInput.parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin(context);
    const { data: m } = await db.from("recruit_messages").select("id, lead_id, channel, subject, body, status").eq("id", data.id).maybeSingle();
    if (!m) throw new Error("That message doesn't exist.");
    if (m.status !== "draft") throw new Error("This message was already handled.");
    const now = new Date().toISOString();
    if (data.action === "discard") {
      await db.from("recruit_messages").update({ status: "discarded", updated_at: now }).eq("id", m.id).eq("status", "draft");
      await db.from("recruit_events").insert({ lead_id: m.lead_id, kind: "discarded", detail: { message: m.id }, actor: context.userId });
      return { ok: true };
    }
    const problems = outreachProblems((m.subject ? `${m.subject}\n` : "") + m.body, m.channel as Channel);
    if (problems.length) throw new Error(`Fix this before sending: ${problems[0]}`);
    const { data: done } = await db.from("recruit_messages").update({ status: "sent", sent_at: now, sent_by: context.userId, updated_at: now }).eq("id", m.id).eq("status", "draft").select("id").maybeSingle();
    if (!done) throw new Error("This message was already handled.");
    const { data: lead } = await db.from("recruit_leads").select("stage").eq("id", m.lead_id).maybeSingle();
    const next = lead ? stageAfterSend(lead.stage as Stage) : null;
    await db.from("recruit_leads").update({ last_contacted_at: now, updated_at: now, ...(next && lead && next !== lead.stage ? { stage: next } : {}) }).eq("id", m.lead_id);
    await db.from("recruit_events").insert([
      { lead_id: m.lead_id, kind: "sent", detail: { message: m.id, channel: m.channel }, actor: context.userId },
      ...(next && lead && next !== lead.stage ? [{ lead_id: m.lead_id, kind: "stage", detail: { from: lead.stage, to: next }, actor: context.userId }] : []),
    ]);
    return { ok: true };
  });

