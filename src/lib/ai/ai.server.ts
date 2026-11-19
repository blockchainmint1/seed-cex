/**
 * Seeds AI server side: price loading and the daily plan check. Server-only.
 * The plan engine itself is the same pure code the browser runs (plan.ts), so
 * the daily message always matches what the member saw when testing.
 */
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

type CheckPlan = { id: string; user_id: string; name: string; settings: unknown; commit_tsd: number; locked_at: string; telegram_daily: boolean; execute: boolean | null; start_now_day: string | null };
type Built = { day: string; message: string; suggestion: { moves: unknown[]; hold: unknown[]; value: number; current: Record<string, number> } };

/** Today's check for one plan: the same engine run the browser tester does, from the lock day on. */
async function buildCheck(p: CheckPlan, ctx: { symbol: Map<string, string>; series: (id: string) => Promise<Series>; executionEnabled: boolean }): Promise<Built | null> {
  const s = p.settings as unknown as PlanSettings;
  const ids = [...new Set(["bitcoin", ...s.coins])];
  const all: Record<string, Series> = {};
  for (const id of ids) all[id] = await ctx.series(id);
  const lockDay = new Date(new Date(p.locked_at).getTime() - 86_400_000).toISOString().slice(0, 10);
  const run = runPlan(all, { ...s, start: lockDay, end: "", amount: Number(p.commit_tsd), weeklyAdd: 0, holdout: 0, enterOn: p.start_now_day ?? undefined }, { minDays: 1 });
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

const PLAN_COLS = "id, user_id, name, settings, commit_tsd, locked_at, telegram_daily, execute, start_now_day";

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
export async function runDailyChecks(opts: { planId?: string; deadlineMs?: number } = {}): Promise<DailyTally> {
  const db = await admin();
  const started = Date.now();
  const tally: DailyTally = { plans: 0, checked: 0, sent: 0, skipped: 0, failed: 0 };
  const ctx = await checkContext(db);
  let q = db.from("ai_plans").select(PLAN_COLS).eq("status", "locked").order("locked_at");
  if (opts.planId) q = q.eq("id", opts.planId);
  const { data: plans, error } = await q.limit(2000);
  if (error) throw new Error(error.message);
  tally.plans = plans?.length ?? 0;

  for (const p of (plans ?? []) as CheckPlan[]) {
    if (Date.now() - started > (opts.deadlineMs ?? 25_000)) break;
    try {
      const built = await buildCheck(p, ctx);
      if (!built) { tally.skipped++; continue; }
      const { data: inserted, error: insErr } = await db.from("ai_plan_checks")
        .upsert({ plan_id: p.id, user_id: p.user_id, day: built.day, message: built.message, suggestion: built.suggestion as never }, { onConflict: "plan_id,day", ignoreDuplicates: true })
        .select("id");
      if (insErr) throw new Error(insErr.message);
      tally.checked++;
      if (!inserted?.length) { tally.skipped++; continue; }
      if (p.telegram_daily && (await sendToMember(db, p.user_id, built.message))) {
        await db.from("ai_plan_checks").update({ sent_at: new Date().toISOString() }).eq("id", inserted[0]!.id);
        tally.sent++;
      } else tally.skipped++;
      // Real buying on: turn today's targets into trades waiting for the owner's OK (sent as its own message).
      if (p.execute) {
        const { prepareRealMoves } = await import("./execute.server");
        await prepareRealMoves(inserted[0]!.id).catch((e) => console.error("[ai-exec] prepare failed", p.id, e));
      }
    } catch (e) {
      tally.failed++;
      console.error("[ai-daily] plan check failed", p.id, e);
    }
  }
  return tally;
}

/**
 * "Buy now anyway": mark the newest price day as the plan's buy-now day and redo that
 * day's check with it, so the daily message, the stored targets and the real trades
 * all say the same thing. Only a check that hasn't been turned into trades is redone.
 * Returns the check id to prepare trades from.
 */
export async function startPlanNow(planId: string): Promise<string> {
  const db = await admin();
  const { data: last } = await db.from("ai_plan_checks").select("id, day, exec_status").eq("plan_id", planId).order("day", { ascending: false }).limit(1).maybeSingle();
  if (!last) throw new Error("This plan has no daily check yet. Try again after the next one.");
  if (last.exec_status !== "none") throw new Error("Today's trades for this plan were already decided. You can buy now after the next daily check.");
  const { data: plan } = await db.from("ai_plans").update({ start_now_day: last.day, updated_at: new Date().toISOString() }).eq("id", planId).select(PLAN_COLS).single();
  if (!plan) throw new Error("Plan not found.");
  const built = await buildCheck(plan as CheckPlan, await checkContext(db));
  if (!built || built.day !== last.day) throw new Error("Couldn't redo today's plan check. Try again in a minute.");
  const { data: upd } = await db.from("ai_plan_checks").update({ message: built.message, suggestion: built.suggestion as never })
    .eq("id", last.id).eq("exec_status", "none").select("id");
  if (!upd?.length) throw new Error("Today's trades for this plan were already decided.");
  return last.id;
}

async function sendToMember(db: Admin, userId: string, text: string): Promise<boolean> {
  const { telegramConfigured, sendTelegram } = await import("@/lib/telegram.server");
  if (!telegramConfigured()) return false;
  const { data } = await db.from("profiles").select("telegram_chat_id, telegram_verified").eq("id", userId).maybeSingle();
  if (!data?.telegram_chat_id || data.telegram_verified !== true) return false;
  await sendTelegram(String(data.telegram_chat_id), text);
  return true;
}
