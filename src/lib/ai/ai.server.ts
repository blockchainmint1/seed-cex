/**
 * Seeds AI server side: price loading and the daily plan check. Server-only.
 * The plan engine itself is the same pure code the browser runs (plan.ts), so
 * the daily message always matches what the member saw when testing.
 */
import { afterRun } from "./check-schedule";
import type { Series } from "./series";
import { planMoves, runPlan, type PlanSettings } from "./plan";
import { dailyMessage } from "./daily-message";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];
async function admin(): Promise<Admin> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

const SITE = "https://seeds.honest.money";

export async function loadSeries(db: Admin, coinId: string, fromDay = "2010-01-01"): Promise<Series> {
  const days: string[] = []; const closes: number[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("ai_daily_prices").select("day,close").eq("coin_id", coinId).gte("day", fromDay).order("day").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) { days.push(r.day); closes.push(Number(r.close)); }
    if (!data || data.length < 1000) break;
  }
  return { days, closes };
}

export async function aiSettings(db?: Admin) {
  const d = db ?? (await admin());
  const { data } = await d.from("ai_settings").select("one_tap_limit_usd, max_commit_tsd, execution_enabled, admin_execution_enabled").eq("id", 1).maybeSingle();
  return {
    oneTapLimitUsd: Number(data?.one_tap_limit_usd ?? 50),
    maxCommitTsd: Number(data?.max_commit_tsd ?? 1000),
    executionEnabled: data?.execution_enabled === true,
    /** Beta testers' (admins included) real buying. */
    adminExecutionEnabled: data?.admin_execution_enabled !== false,
  };
}

export type DailyTally = { plans: number; checked: number; sent: number; skipped: number; failed: number };

type CheckPlan = { id: string; user_id: string; name: string; settings: unknown; commit_tsd: number; locked_at: string; telegram_daily: boolean; execute: boolean | null; override_days: string[] | null };
type Built = { day: string; message: string; suggestion: { moves: unknown[]; hold: unknown[]; value: number; current: Record<string, number> } };

/** Today's check for one plan: the same engine run the browser tester does, from the lock day on. */
async function buildCheck(p: CheckPlan, ctx: { symbol: Map<string, string>; series: (id: string) => Promise<Series>; executionEnabled: boolean }): Promise<Built | null> {
  const s = p.settings as unknown as PlanSettings;
  const ids = [...new Set(["bitcoin", ...s.coins])];
  const all: Record<string, Series> = {};
  for (const id of ids) all[id] = await ctx.series(id);
  const lockDay = new Date(new Date(p.locked_at).getTime() - 86_400_000).toISOString().slice(0, 10);
  const run = runPlan(all, { ...s, start: lockDay, end: "", amount: Number(p.commit_tsd), weeklyAdd: 0, holdout: 0, enterOn: p.override_days ?? [] }, { minDays: 1 });
  const day = run.points.at(-1)?.day;
  if (run.error || !day) return null;
  const value = run.points.at(-1)!.plan;
  const last = run.changes.at(-1);
  const moves = last && last.day === day ? planMoves(last.before, last.after, last.value) : [];
  const named = moves.map((m) => ({ ...m, coin: ctx.symbol.get(m.coin) ?? m.coin }));
  const hold = Object.entries(run.current ?? {}).filter(([, w]) => w > 0.001).sort((a, b) => b[1] - a[1])
    .map(([id, w]) => ({ symbol: ctx.symbol.get(id) ?? id, pct: w * 100 }));
  const message = dailyMessage({
    planName: p.name, day, moves: named, hold, valueUsd: value, commitTsd: Number(p.commit_tsd),
    reviewUrl: `${SITE}/account/ai`, executionLive: ctx.executionEnabled || p.execute === true,
  });
  return { day, message, suggestion: { moves: named, hold, value, current: run.current ?? {} } };
}

const PLAN_COLS = "id, user_id, name, settings, commit_tsd, locked_at, telegram_daily, execute, override_days";

async function checkContext(db: Admin) {
  const settings = await aiSettings(db);
  const { data: coinRows } = await db.from("ai_coins").select("id, symbol");
  const symbol = new Map((coinRows ?? []).map((c) => [c.id, c.symbol.toUpperCase()]));
  const cache = new Map<string, Series>();
  const series = async (id: string) => {
    if (!cache.has(id)) cache.set(id, await loadSeries(db, id, "2015-01-01"));
    return cache.get(id)!;
  };
  return { settings, symbol, series, executionEnabled: settings.executionEnabled };
}

/** One check per live plan per price day. Safe to re-run: (plan, day) is unique and only a new row sends. */
/**
 * Plan checks. With `due`, only plans whose own time has come (next_check_at, every 24 h
 * from when the plan was started), each claimed first so overlapping runs never check a
 * plan twice. With `planId`, that one plan now. Otherwise every live plan (admin "run now").
 * Afterwards each plan's next time is set by afterRun (check-schedule.ts).
 */
export async function runDailyChecks(opts: { planId?: string; deadlineMs?: number; due?: boolean } = {}): Promise<DailyTally> {
  const db = await admin();
  const started = Date.now();
  const tally: DailyTally = { plans: 0, checked: 0, sent: 0, skipped: 0, failed: 0 };
  const nowIso = new Date().toISOString();
  let q = db.from("ai_plans").select(`${PLAN_COLS}, next_check_at`).eq("status", "locked").order("next_check_at", { nullsFirst: true });
  if (opts.planId) q = q.eq("id", opts.planId);
  if (opts.due) q = q.or(`next_check_at.is.null,next_check_at.lte.${nowIso}`);
  const { data: plans, error } = await q.limit(opts.due ? 200 : 2000);
  if (error) throw new Error(error.message);
  tally.plans = plans?.length ?? 0;
  if (!plans?.length) return tally;
  const ctx = await checkContext(db);

  for (const row of plans as (CheckPlan & { next_check_at: string | null })[]) {
    if (Date.now() - started > (opts.deadlineMs ?? 25_000)) break;
    const p = row as CheckPlan;
    if (opts.due) {
      // Claim: push the time out briefly so a parallel run skips this plan.
      let claim = db.from("ai_plans").update({ next_check_at: new Date(Date.now() + 10 * 60_000).toISOString() }).eq("id", p.id).eq("status", "locked");
      claim = row.next_check_at ? claim.eq("next_check_at", row.next_check_at) : claim.is("next_check_at", null);
      const { data: got } = await claim.select("id");
      if (!got?.length) continue;
    }
    let newCheck = false;
    try {
      const built = await buildCheck(p, ctx);
      if (!built) { tally.skipped++; newCheck = true; continue; }
      const { data: inserted, error: insErr } = await db.from("ai_plan_checks")
        .upsert({ plan_id: p.id, user_id: p.user_id, day: built.day, message: built.message, suggestion: built.suggestion as never }, { onConflict: "plan_id,day", ignoreDuplicates: true })
        .select("id");
      if (insErr) throw new Error(insErr.message);
      tally.checked++;
      if (!inserted?.length) { tally.skipped++; continue; }
      newCheck = true;
      // Real buying on: today's trades wait for the owner's OK. When the rule asks something
      // ("you're X, the rule says Y") that question is today's one Telegram message.
      let asked = false;
      if (p.execute) {
        const { prepareRealMoves } = await import("./execute.server");
        asked = (await prepareRealMoves(inserted[0]!.id).catch((e) => { console.error("[ai-exec] prepare failed", p.id, e); return null; }))?.asked === true;
      }
      if (asked) tally.sent++;
      else if (p.telegram_daily && (await sendToMember(db, p.user_id, built.message))) {
        await db.from("ai_plan_checks").update({ sent_at: new Date().toISOString() }).eq("id", inserted[0]!.id);
        tally.sent++;
      } else tally.skipped++;
    } catch (e) {
      tally.failed++;
      console.error("[ai-daily] plan check failed", p.id, e);
    } finally {
      const next = afterRun({ startedAt: p.locked_at, now: Date.now(), newCheck });
      await db.from("ai_plans").update({ next_check_at: new Date(next).toISOString() }).eq("id", p.id);
    }
  }
  return tally;
}

/**
 * Override the rule on the newest price day ("Buy now anyway" on a stay-in-TSD day, or
 * "Override: keep holding" on a sell-to-TSD day still waiting for an answer): add the day
 * to the plan's override days and redo that day's check with it, so the daily message,
 * the stored targets and the real trades all agree. A waiting day's queued trades (never
 * started) are withdrawn first. Returns the check id to prepare trades from.
 */
export async function overridePlanDay(planId: string, userId: string): Promise<string> {
  const db = await admin();
  const { data: last } = await db.from("ai_plan_checks").select("id, day, exec_status").eq("plan_id", planId).eq("user_id", userId).order("day", { ascending: false }).limit(1).maybeSingle();
  if (!last) throw new Error("This plan has no daily check yet. Try again after the next one.");
  if (last.exec_status === "waiting") {
    const { data: moves } = await db.from("ai_plan_moves").select("status").eq("check_id", last.id);
    if ((moves ?? []).some((m) => m.status !== "queued")) throw new Error("Today's trades already started, so they can't be overridden.");
    const { data: reopened } = await db.from("ai_plan_checks").update({ exec_status: "none", exec_total_usd: null, exec_expires_at: null })
      .eq("id", last.id).eq("exec_status", "waiting").select("id");
    if (!reopened?.length) throw new Error("Today's trades were just decided, so they can't be overridden.");
    await db.from("ai_plan_moves").delete().eq("check_id", last.id).eq("status", "queued");
  } else if (last.exec_status !== "none") {
    throw new Error("Today's trades for this plan were already decided. You can override after the next daily check.");
  }
  const { data: cur } = await db.from("ai_plans").select("override_days").eq("id", planId).eq("user_id", userId).single();
  const days = [...new Set([...((cur?.override_days as string[] | null) ?? []), last.day])].sort();
  const { data: plan } = await db.from("ai_plans").update({ override_days: days, updated_at: new Date().toISOString() }).eq("id", planId).eq("user_id", userId).select(PLAN_COLS).single();
  if (!plan) throw new Error("Plan not found.");
  const built = await buildCheck(plan as CheckPlan, await checkContext(db));
  if (!built || built.day !== last.day) throw new Error("Couldn't redo today's plan check. Try again in a minute.");
  const { data: upd } = await db.from("ai_plan_checks").update({ message: built.message, suggestion: built.suggestion as never })
    .eq("id", last.id).eq("exec_status", "none").select("id");
  if (!upd?.length) throw new Error("Today's trades for this plan were already decided.");
  return last.id;
}

export type WaitReason = { id: string; symbol: string; price: number | null; average: number | null; days: number; reason: "below-average" | "stop-loss" };

/** Why each of these coins is in TSD on `day`: below its trend-exit average (price vs average), or held after a stop-loss. */
export async function waitReasons(settings: PlanSettings, coinIds: string[], day: string | null): Promise<WaitReason[]> {
  const db = await admin();
  const { data: coinRows } = await db.from("ai_coins").select("id, symbol").in("id", coinIds.length ? coinIds : ["-"]);
  const sym = new Map((coinRows ?? []).map((c) => [c.id, c.symbol.toUpperCase()]));
  const n = settings.exitMA > 0 ? settings.exitMA : 0;
  return Promise.all(coinIds.map(async (id) => {
    if (!n) return { id, symbol: sym.get(id) ?? id, price: null, average: null, days: 0, reason: "stop-loss" as const };
    const { data: rows } = await db.from("ai_daily_prices").select("close").eq("coin_id", id).lte("day", day ?? "9999-12-31").order("day", { ascending: false }).limit(n);
    const closes = (rows ?? []).map((r) => Number(r.close));
    const price = closes[0] ?? null;
    const average = closes.length === n ? closes.reduce((a, b) => a + b, 0) / n : null;
    const below = price != null && average != null && price < average;
    return { id, symbol: sym.get(id) ?? id, price, average, days: n, reason: below ? ("below-average" as const) : ("stop-loss" as const) };
  }));
}

/** One line for Telegram / the site: why the rule says TSD. */
export function waitReasonText(r: WaitReason): string {
  const m = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n >= 100 ? 0 : 2 });
  return r.reason === "below-average" && r.price != null && r.average != null
    ? `${r.symbol} is below its ${r.days}-day average (${m(r.price)} vs ${m(r.average)})`
    : `${r.symbol} is waiting after a stop-loss`;
}

async function sendToMember(db: Admin, userId: string, text: string): Promise<boolean> {
  const { telegramConfigured, sendTelegram } = await import("@/lib/telegram.server");
  if (!telegramConfigured()) return false;
  const { data } = await db.from("profiles").select("telegram_chat_id, telegram_verified").eq("id", userId).maybeSingle();
  if (!data?.telegram_chat_id || data.telegram_verified !== true) return false;
  await sendTelegram(String(data.telegram_chat_id), text);
  return true;
}
