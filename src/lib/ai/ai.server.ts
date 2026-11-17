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
  const { data } = await d.from("ai_settings").select("one_tap_limit_usd, max_commit_tsd, execution_enabled").eq("id", 1).maybeSingle();
  return {
    oneTapLimitUsd: Number(data?.one_tap_limit_usd ?? 50),
    maxCommitTsd: Number(data?.max_commit_tsd ?? 1000),
    executionEnabled: data?.execution_enabled === true,
  };
}

export type DailyTally = { plans: number; checked: number; sent: number; skipped: number; failed: number };

/** One check per live plan per price day. Safe to re-run: (plan, day) is unique and only a new row sends. */
export async function runDailyChecks(opts: { planId?: string; deadlineMs?: number } = {}): Promise<DailyTally> {
  const db = await admin();
  const started = Date.now();
  const tally: DailyTally = { plans: 0, checked: 0, sent: 0, skipped: 0, failed: 0 };
  const settings = await aiSettings(db);
  let q = db.from("ai_plans").select("id, user_id, name, settings, commit_tsd, locked_at, telegram_daily").eq("status", "locked").order("locked_at");
  if (opts.planId) q = q.eq("id", opts.planId);
  const { data: plans, error } = await q.limit(2000);
  if (error) throw new Error(error.message);
  tally.plans = plans?.length ?? 0;

  const { data: coinRows } = await db.from("ai_coins").select("id, symbol");
  const symbol = new Map((coinRows ?? []).map((c) => [c.id, c.symbol.toUpperCase()]));
  const cache = new Map<string, Series>();
  const series = async (id: string) => {
    if (!cache.has(id)) cache.set(id, await loadSeries(db, id, "2015-01-01"));
    return cache.get(id)!;
  };

  for (const p of plans ?? []) {
    if (Date.now() - started > (opts.deadlineMs ?? 25_000)) break;
    try {
      const s = p.settings as unknown as PlanSettings;
      const ids = [...new Set(["bitcoin", ...s.coins])];
      const all: Record<string, Series> = {};
      for (const id of ids) all[id] = await series(id);
      const lockDay = new Date(new Date(p.locked_at).getTime() - 86_400_000).toISOString().slice(0, 10);
      const run = runPlan(all, { ...s, start: lockDay, end: "", amount: Number(p.commit_tsd), weeklyAdd: 0, holdout: 0 }, { minDays: 1 });
      const day = run.points.at(-1)?.day;
      if (run.error || !day) { tally.skipped++; continue; }
      const value = run.points.at(-1)!.plan;
      const last = run.changes.at(-1);
      const moves = last && last.day === day ? planMoves(last.before, last.after, last.value) : [];
      const named = moves.map((m) => ({ ...m, coin: symbol.get(m.coin) ?? m.coin }));
      const hold = Object.entries(run.current ?? {}).filter(([, w]) => w > 0.001).sort((a, b) => b[1] - a[1])
        .map(([id, w]) => ({ symbol: symbol.get(id) ?? id, pct: w * 100 }));
      const message = dailyMessage({
        planName: p.name, day, moves: named, hold, valueUsd: value, commitTsd: Number(p.commit_tsd),
        reviewUrl: `${SITE}/ai?plan=${p.id}`, executionLive: settings.executionEnabled,
      });
      const { data: inserted, error: insErr } = await db.from("ai_plan_checks")
        .upsert({ plan_id: p.id, user_id: p.user_id, day, message, suggestion: { moves: named, hold, value, current: run.current ?? {} } as never }, { onConflict: "plan_id,day", ignoreDuplicates: true })
        .select("id");
      if (insErr) throw new Error(insErr.message);
      tally.checked++;
      if (!inserted?.length || !p.telegram_daily) { tally.skipped++; continue; }
      if (await sendToMember(db, p.user_id, message)) {
        await db.from("ai_plan_checks").update({ sent_at: new Date().toISOString() }).eq("id", inserted[0]!.id);
        tally.sent++;
      } else tally.skipped++;
    } catch (e) {
      tally.failed++;
      console.error("[ai-daily] plan check failed", p.id, e);
    }
  }
  return tally;
}

async function sendToMember(db: Admin, userId: string, text: string): Promise<boolean> {
  const { telegramConfigured, sendTelegram } = await import("@/lib/telegram.server");
  if (!telegramConfigured()) return false;
  const { data } = await db.from("profiles").select("telegram_chat_id, telegram_verified").eq("id", userId).maybeSingle();
  if (!data?.telegram_chat_id || data.telegram_verified !== true) return false;
  await sendTelegram(String(data.telegram_chat_id), text);
  return true;
}
