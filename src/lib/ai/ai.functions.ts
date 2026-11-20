import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/lib/admin-guard";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AI_CATALOG, aiPocketFor, catalogByGecko } from "./catalog";
import { cleanSettings, lockBlocker } from "./lock-rules";
import type { PlanSettings } from "./plan";
import { buyNowTsd, canBuyNow, coinsWaiting, planWaitingInTsd } from "./start-now";

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

const POCKET_NAMES: Record<string, string> = { BTC: "Bitcoin", LTC: "Litecoin", EVM: "Ethereum", DOGE: "Dogecoin", BCH: "Bitcoin Cash", XRP: "XRP", TRX: "TRON", SOL: "Solana" };

// ---------------- members ----------------

export type MyAiPlan = {
  id: string; name: string; status: string; commitTsd: number; lockedAt: string; telegramDaily: boolean;
  settings: PlanSettings;
  lastCheck: { day: string; message: string; sentAt: string | null } | null;
  /** Up to 14 most recent daily checks, newest first. */
  history: { day: string; message: string; sentAt: string | null }[];
  /** Real buying switched on for this plan (beta testers). */
  execute: boolean;
  /** What the plan owns from its finished real trades (TSD + coin units), when real buying has run. */
  ledger: { tsd: number; units: Record<string, number> } | null;
  /** The newest day with real trades: waiting for an OK, running, or finished. */
  realDay: AiRealDay | null;
  /** The latest check keeps some or all of the plan in TSD, waiting for a signal. */
  waitingInTsd: boolean;
  /** "Buy now anyway" can be offered (basket plans waiting in TSD). */
  canBuyNow: boolean;
  /** Days the owner overrode a rule that said be in TSD. */
  overrideDays: string[];
  /** When this plan's next daily check is due (every 24 h at the time of day it was started). */
  nextCheckAt: string | null;
};

export type AiRealDay = {
  checkId: string; day: string; status: string; totalUsd: number | null; expiresAt: string | null; decidedVia: string | null;
  moves: { id: string; side: string; coin: string; usd: number; amount: number; status: string; amountIn: number | null; amountOut: number | null; error: string | null }[];
};

/** Signed-in: my locked plans, latest daily check, limits, and whether my pocket is linked. */
export const getMyAiPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: plans }, { data: checks }, telegram, { data: moves }] = await Promise.all([
      supabase.from("ai_plans").select("id, name, status, commit_tsd, locked_at, telegram_daily, settings, execute, override_days, next_check_at").order("locked_at", { ascending: false }),
      supabase.from("ai_plan_checks").select("id, plan_id, day, message, sent_at, exec_status, exec_total_usd, exec_expires_at, exec_decided_via, suggestion").order("day", { ascending: false }).limit(300),
      supabase.from("profiles").select("telegram_verified").eq("id", userId).maybeSingle(),
      supabase.from("ai_plan_moves").select("id, check_id, plan_id, seq, side, coin_id, usd, amount, status, amount_in, amount_out, error").order("created_at", { ascending: false }).limit(500),
    ]);
    const { isTesterUser, planLedger } = await import("./execute.server");
    const tester = await isTesterUser(userId);
    const realDays = new Map<string, AiRealDay>();
    for (const c of checks ?? []) {
      if (c.exec_status === "none" || realDays.has(c.plan_id)) continue;
      realDays.set(c.plan_id, {
        checkId: c.id, day: c.day, status: c.exec_status, totalUsd: c.exec_total_usd == null ? null : Number(c.exec_total_usd),
        expiresAt: c.exec_expires_at, decidedVia: c.exec_decided_via,
        moves: (moves ?? []).filter((m) => m.check_id === c.id).sort((a, b) => a.seq - b.seq).map((m) => ({
          id: m.id, side: m.side, coin: m.coin_id, usd: Number(m.usd), amount: Number(m.amount), status: m.status,
          amountIn: m.amount_in == null ? null : Number(m.amount_in), amountOut: m.amount_out == null ? null : Number(m.amount_out), error: m.error,
        })),
      });
    }
    const ranReal = new Set((moves ?? []).filter((m) => m.status === "done").map((m) => m.plan_id));
    const ledgers = new Map(await Promise.all((plans ?? []).filter((p) => ranReal.has(p.id)).map(async (p) => [p.id, await planLedger({ id: p.id, commit_tsd: Number(p.commit_tsd) })] as const)));
    const { aiSettings } = await import("./ai.server");
    const { swapSendContext } = await import("@/lib/xchain/send.server");
    const { oneTapLimitFor } = await import("./execute.server");
    const [settings, ctx, oneTap] = await Promise.all([aiSettings(), swapSendContext(userId), oneTapLimitFor(userId)]);
    const history = new Map<string, { day: string; message: string; sentAt: string | null }[]>();
    const latestTargets = new Map<string, Record<string, number>>();
    for (const c of checks ?? []) {
      if (!latestTargets.has(c.plan_id)) latestTargets.set(c.plan_id, ((c.suggestion ?? {}) as { current?: Record<string, number> }).current ?? {});
      const list = history.get(c.plan_id) ?? [];
      if (list.length < 14) list.push({ day: c.day, message: c.message, sentAt: c.sent_at });
      history.set(c.plan_id, list);
    }
    return {
      plans: (plans ?? []).map((p): MyAiPlan => ({
        id: p.id, name: p.name, status: p.status, commitTsd: Number(p.commit_tsd), lockedAt: p.locked_at,
        telegramDaily: p.telegram_daily, settings: p.settings as unknown as PlanSettings,
        lastCheck: history.get(p.id)?.[0] ?? null, history: history.get(p.id) ?? [],
        execute: p.execute === true, ledger: ledgers.get(p.id) ?? null, realDay: realDays.get(p.id) ?? null,
        waitingInTsd: latestTargets.has(p.id) && planWaitingInTsd(p.settings as unknown as PlanSettings, latestTargets.get(p.id)),
        canBuyNow: latestTargets.has(p.id) && canBuyNow(p.settings as unknown as PlanSettings, latestTargets.get(p.id)),
        overrideDays: (p.override_days as string[] | null) ?? [],
        nextCheckAt: p.next_check_at ?? null,
      })),
      limits: { maxCommitTsd: tester ? null : settings.maxCommitTsd, oneTapLimitUsd: oneTap.limit },
      executionEnabled: settings.executionEnabled,
      /** Beta tester (admins included): may switch real buying on, no plan-size/count limits. */
      tester,
      testerExecutionOn: settings.adminExecutionEnabled,
      telegramLinked: telegram.data?.telegram_verified === true,
      pocket: ctx.link ? { mode: ctx.link.mode as string, pockets: (ctx.link.pockets ?? []) as string[] } : null,
    };
  });

const lockInput = z.object({
  name: z.string().trim().min(1).max(60),
  commitTsd: z.number().finite(),
  settings: z.record(z.string(), z.unknown()),
  telegramDaily: z.boolean().default(true),
});

/** Signed-in: lock a tested plan into my account. Server re-checks coins, limits and pockets. */
export const lockAiPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => lockInput.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await db();
    const { data: coins } = await admin.from("ai_coins").select("id, swap_coin").eq("active", true);
    const active = (coins ?? []).map((c) => c.id);
    const settings = cleanSettings(data.settings as Partial<PlanSettings>, active);
    const { aiSettings } = await import("./ai.server");
    const { swapSendContext } = await import("@/lib/xchain/send.server");
    const [limits, ctx, { count }] = await Promise.all([
      aiSettings(admin),
      swapSendContext(context.userId),
      admin.from("ai_plans").select("id", { count: "exact", head: true }).eq("user_id", context.userId).in("status", ["locked", "paused"]),
    ]);
    const pockets = (ctx.link?.pockets ?? []) as string[];
    const swapOf = new Map((coins ?? []).map((c) => [c.id, c.swap_coin]));
    const missing = ctx.link
      ? [...new Set(settings.coins.map((id) => aiPocketFor(swapOf.get(id))).filter((p): p is NonNullable<typeof p> => Boolean(p) && !pockets.includes(p!)))].map((p) => POCKET_NAMES[p] ?? p)
      : [];
    const { isTesterUser } = await import("./execute.server");
    const blocker = lockBlocker({ name: data.name, commitTsd: data.commitTsd, settings, maxCommitTsd: limits.maxCommitTsd, activePlans: count ?? 0, missingPockets: missing, noLimits: await isTesterUser(context.userId) });
    if (blocker) throw new Error(blocker);
    const { data: row, error } = await admin.from("ai_plans")
      .insert({ user_id: context.userId, name: data.name.trim(), commit_tsd: data.commitTsd, settings: settings as never, telegram_daily: data.telegramDaily })
      .select("id").single();
    if (error) throw new Error(error.message);
    // First check right away, so the member sees (and gets) today's plan immediately.
    const { runDailyChecks } = await import("./ai.server");
    await runDailyChecks({ planId: row.id, deadlineMs: 8000 }).catch((e) => console.error("[ai] first check failed", e));
    return { id: row.id };
  });

const editInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(60).optional(),
  commitTsd: z.number().finite().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Signed-in: change one of my live or paused plans — name, TSD committed, or its
 * rules. Re-runs every lock check (coins Seeds can buy, limits, linked pockets),
 * so an edited plan is held to the same rules as a newly locked one.
 */
export const editMyAiPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => editInput.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await db();
    const { data: plan } = await admin.from("ai_plans").select("id, name, commit_tsd, settings, status")
      .eq("id", data.id).eq("user_id", context.userId).neq("status", "ended").maybeSingle();
    if (!plan) throw new Error("Plan not found, or it has already ended.");
    const { data: coins } = await admin.from("ai_coins").select("id, swap_coin").eq("active", true);
    const active = (coins ?? []).map((c) => c.id);
    const settings = cleanSettings((data.settings ?? plan.settings) as Partial<PlanSettings>, active);
    const name = data.name ?? plan.name;
    const commitTsd = data.commitTsd ?? Number(plan.commit_tsd);
    const { aiSettings } = await import("./ai.server");
    const { swapSendContext } = await import("@/lib/xchain/send.server");
    const [limits, ctx, { count }] = await Promise.all([
      aiSettings(admin),
      swapSendContext(context.userId),
      admin.from("ai_plans").select("id", { count: "exact", head: true }).eq("user_id", context.userId).in("status", ["locked", "paused"]).neq("id", data.id),
    ]);
    const pockets = (ctx.link?.pockets ?? []) as string[];
    const swapOf = new Map((coins ?? []).map((c) => [c.id, c.swap_coin]));
    const missing = ctx.link
      ? [...new Set(settings.coins.map((id) => aiPocketFor(swapOf.get(id))).filter((p): p is NonNullable<typeof p> => Boolean(p) && !pockets.includes(p!)))].map((p) => POCKET_NAMES[p] ?? p)
      : [];
    const { isTesterUser } = await import("./execute.server");
    const blocker = lockBlocker({ name, commitTsd, settings, maxCommitTsd: limits.maxCommitTsd, activePlans: count ?? 0, missingPockets: missing, noLimits: await isTesterUser(context.userId) });
    if (blocker) throw new Error(blocker);
    const { error } = await admin.from("ai_plans")
      .update({ name: name.trim(), commit_tsd: commitTsd, settings: settings as never, updated_at: new Date().toISOString() })
      .eq("id", data.id).eq("user_id", context.userId).neq("status", "ended");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const statusInput = z.object({ id: z.string().uuid(), status: z.enum(["locked", "paused", "ended"]).optional(), telegramDaily: z.boolean().optional() });

/** Signed-in: pause, resume or end one of my plans, or switch its daily Telegram check. Ended is final. */
export const updateMyAiPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => statusInput.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await db();
    const patch: { status?: string; telegram_daily?: boolean; updated_at: string } = { updated_at: new Date().toISOString() };
    if (data.status) patch.status = data.status;
    if (data.telegramDaily !== undefined) patch.telegram_daily = data.telegramDaily;
    const { data: rows, error } = await admin.from("ai_plans").update(patch)
      .eq("id", data.id).eq("user_id", context.userId).neq("status", "ended").select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Plan not found, or it has already ended.");
    if (data.status && data.status !== "locked") {
      const { cancelOpenPlanMoves } = await import("./execute.server");
      await cancelOpenPlanMoves(data.id, data.status === "ended" ? "The plan ended." : "The plan was paused.");
    }
    return { ok: true };
  });

const realInput = z.object({ id: z.string().uuid(), on: z.boolean(), startNow: z.boolean().optional() });

export type RealStartPreview = {
  day: string | null;
  mode: PlanSettings["mode"];
  /** The plan is keeping money in TSD right now. */
  waiting: boolean;
  canBuyNow: boolean;
  /** TSD a "Buy now anyway" day would spend. */
  buyNowTsd: number;
  /** Why each waiting coin is in TSD: below its trend-exit average (price vs average), or held after a stop-loss. */
  coins: { symbol: string; price: number | null; average: number | null; days: number; reason: "below-average" | "stop-loss" }[];
};

/** Signed-in: before switching real buying on (or buying now), what the plan's latest check says to hold. */
export const getRealStartPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<RealStartPreview> => {
    const admin = await db();
    const { data: plan } = await admin.from("ai_plans").select("id, commit_tsd, settings").eq("id", data.id).eq("user_id", context.userId).neq("status", "ended").maybeSingle();
    if (!plan) throw new Error("Plan not found, or it has already ended.");
    const settings = plan.settings as unknown as PlanSettings;
    const { data: last } = await admin.from("ai_plan_checks").select("day, suggestion").eq("plan_id", plan.id).order("day", { ascending: false }).limit(1).maybeSingle();
    const current = ((last?.suggestion ?? {}) as { current?: Record<string, number> }).current ?? {};
    const { waitReasons } = await import("./ai.server");
    const coins = (await waitReasons(settings, coinsWaiting(settings, current), last?.day ?? null)).map(({ id: _id, ...c }) => c);
    return {
      day: last?.day ?? null, mode: settings.mode,
      waiting: last ? planWaitingInTsd(settings, current) : false,
      canBuyNow: last ? canBuyNow(settings, current) : false,
      buyNowTsd: buyNowTsd(settings, Number(plan.commit_tsd), current),
      coins,
    };
  });

/**
 * Signed-in (beta testers): switch real buying on or off for one of my plans. Turning it on
 * prepares the plan's first real trades from its latest check and asks me to confirm them;
 * nothing is sent until I do. Turning it off stops anything not yet started. With startNow
 * ("Buy now anyway", basket plans waiting in TSD) the latest check is redone as a buy-in day
 * and the plan's rules look forward from it.
 */
export const setAiPlanRealBuying = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => realInput.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await db();
    const { data: plan } = await admin.from("ai_plans").select("id, user_id, name, status, commit_tsd, settings, execute")
      .eq("id", data.id).eq("user_id", context.userId).neq("status", "ended").maybeSingle();
    if (!plan) throw new Error("Plan not found, or it has already ended.");
    const ex = await import("./execute.server");
    if (!data.on) {
      await admin.from("ai_plans").update({ execute: false, updated_at: new Date().toISOString() }).eq("id", plan.id);
      await ex.cancelOpenPlanMoves(plan.id, "Real buying was switched off.");
      return { ok: true, moves: 0, note: null as string | null };
    }
    const blocker = await ex.planRealBlocker({ ...plan, commit_tsd: Number(plan.commit_tsd) });
    if (blocker) throw new Error(blocker);
    await admin.from("ai_plans").update({ execute: true, execute_since: plan.execute ? undefined : new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", plan.id);
    if (data.startNow) {
      const { data: last } = await admin.from("ai_plan_checks").select("suggestion").eq("plan_id", plan.id).order("day", { ascending: false }).limit(1).maybeSingle();
      const current = ((last?.suggestion ?? {}) as { current?: Record<string, number> }).current ?? {};
      if (!canBuyNow(plan.settings as unknown as PlanSettings, current)) throw new Error("This plan isn't waiting in TSD, so there's nothing to buy now.");
      const { overridePlanDay } = await import("./ai.server");
      const checkId = await overridePlanDay(plan.id, context.userId);
      const r = await ex.prepareRealMoves(checkId, { askWaiting: false });
      return { ok: true, moves: r.moves, note: r.moves ? "Override saved. Confirm the trades below to start them. Your rules look forward from today." : "Override saved. Nothing needs to trade. Your rules look forward from today." };
    }
    // The newest check becomes the first real day (if it hasn't been used for one already).
    const { data: last } = await admin.from("ai_plan_checks").select("id, exec_status").eq("plan_id", plan.id).order("day", { ascending: false }).limit(1).maybeSingle();
    if (!last) return { ok: true, moves: 0, note: "Real buying is on. Your first trades come with the next daily check." };
    const r = last.exec_status === "none" ? await ex.prepareRealMoves(last.id, { askWaiting: false }) : { moves: 0, reason: "already prepared" };
    return { ok: true, moves: r.moves, note: r.moves ? null : r.reason === "nothing to trade" ? "Real buying is on. Nothing to trade right now." : "Real buying is on." };
  });

const decideInput = z.object({ checkId: z.string().uuid(), choice: z.enum(["yes", "no"]) });

/**
 * Signed-in: confirm or skip today's real AI trades. Starts the first one right away.
 * Above the member's one-tap limit, confirming needs a fresh authenticator code (audit #3 A6).
 */
export const decideAiTrades = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => decideInput.parse(input))
  .handler(async ({ data, context }) => {
    const ex = await import("./execute.server");
    if (data.choice === "yes" && !(await ex.isTesterUser(context.userId))) throw new Error("Real buying is open to beta testers for now.");
    if (data.choice === "yes") {
      const { data: check } = await context.supabase.from("ai_plan_checks").select("exec_total_usd").eq("id", data.checkId).eq("user_id", context.userId).maybeSingle();
      const { limit } = await ex.oneTapLimitFor(context.userId);
      const { hasTwoFactor } = await import("@/lib/two-factor.server");
      const { freshTwoFactor } = await import("@/lib/two-factor");
      const { siteConfirmProblem } = await import("./execute-rules");
      const problem = siteConfirmProblem({
        totalUsd: Number(check?.exec_total_usd ?? 0), limitUsd: limit,
        twoFactorOn: await hasTwoFactor(context.userId),
        fresh: freshTwoFactor(context.claims as never, Math.floor(Date.now() / 1000)),
      });
      if (problem) throw new Error(problem);
    }
    const out = await ex.decideCheck(context.userId, data.checkId, data.choice, "site");
    if (out === "approved") await ex.advanceAiMoves({ userId: context.userId }).catch((e) => console.error("[ai-exec] first start failed", e));
    return { status: out };
  });

// ---------------- admins ----------------

export type AdminAiCoin = {
  id: string; symbol: string; name: string; active: boolean; swapCoin: string | null;
  days: number; firstDay: string | null; lastDay: string | null; source: string | null;
};

export const getAdminAi = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const admin = await db();
    await admin.rpc("ai_sync_ingest"); // save any finished downloads first
    const { aiSettings } = await import("./ai.server");
    const [{ data: coins }, { data: plans }, { data: checks }, settings] = await Promise.all([
      admin.from("ai_coins").select("id, symbol, name, active, swap_coin, rank").order("rank"),
      admin.from("ai_plans").select("id, user_id, name, status, commit_tsd, locked_at, settings").order("locked_at", { ascending: false }).limit(500),
      admin.from("ai_plan_checks").select("plan_id, day, sent_at").gte("day", new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)),
      aiSettings(admin),
    ]);
    const out: AdminAiCoin[] = [];
    for (const c of coins ?? []) {
      const [{ count }, first, last] = await Promise.all([
        admin.from("ai_daily_prices").select("day", { count: "exact", head: true }).eq("coin_id", c.id),
        admin.from("ai_daily_prices").select("day").eq("coin_id", c.id).order("day").limit(1),
        admin.from("ai_daily_prices").select("day, source").eq("coin_id", c.id).order("day", { ascending: false }).limit(1),
      ]);
      out.push({ id: c.id, symbol: c.symbol, name: c.name, active: c.active, swapCoin: c.swap_coin, days: count ?? 0,
        firstDay: first.data?.[0]?.day ?? null, lastDay: last.data?.[0]?.day ?? null, source: last.data?.[0]?.source ?? null });
    }
    const userIds = [...new Set((plans ?? []).map((p) => p.user_id))];
    const { data: profiles } = userIds.length ? await admin.from("profiles").select("id, display_name").in("id", userIds) : { data: [] };
    const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.display_name as string | null]));
    const sentBy = new Map<string, number>();
    for (const c of checks ?? []) if (c.sent_at) sentBy.set(c.plan_id, (sentBy.get(c.plan_id) ?? 0) + 1);
    const added = new Set((coins ?? []).map((c) => c.id));
    return {
      coins: out,
      addable: AI_CATALOG.filter((c) => !added.has(c.geckoId)),
      settings,
      plans: (plans ?? []).map((p) => ({
        id: p.id, member: nameOf.get(p.user_id) ?? p.user_id.slice(0, 8), name: p.name, status: p.status,
        commitTsd: Number(p.commit_tsd), lockedAt: p.locked_at,
        coins: ((p.settings as unknown as PlanSettings)?.coins ?? []).length,
        mode: (p.settings as unknown as PlanSettings)?.mode ?? "basket",
        alerts7d: sentBy.get(p.id) ?? 0,
      })),
    };
  });

const coinInput = z.object({ id: z.string().min(1).max(80), active: z.boolean() });

/** Admin: switch a coin on/off, or add one from the catalog of coins Seeds can buy. */
export const adminAiSetCoin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => coinInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const cat = catalogByGecko(data.id);
    if (!cat) throw new Error("Only coins Seeds can buy and sell back can be offered.");
    const admin = await db();
    const { error } = await admin.from("ai_coins").upsert({
      id: cat.geckoId, symbol: cat.symbol, name: cat.name, swap_coin: cat.swapCoin, binance_symbol: cat.binance, active: data.active, updated_at: new Date().toISOString(),
      // No Binance listing: go straight to CoinGecko history (never guess a Binance ticker that could be another coin).
      ...(cat.binance ? {} : { binance_ok: false }),
    });
    if (error) throw new Error(error.message);
    if (data.active) await admin.rpc("ai_sync_request", { _with_markets: true });
    return { ok: true };
  });

/** Admin: download any missing price history now (saved a few seconds later). */
export const adminAiRefresh = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const admin = await db();
    await admin.rpc("ai_sync_ingest");
    const { data: n } = await admin.rpc("ai_sync_request", { _with_markets: true });
    return { queued: Number(n ?? 0) };
  });

const settingsInput = z.object({ oneTapLimitUsd: z.number().min(0).max(100000), oneTapMemberMaxUsd: z.number().min(0).max(100000).optional(), maxCommitTsd: z.number().min(10).max(100000), testerExecution: z.boolean().optional() });

/** Admin: one-tap Telegram limit, the per-plan TSD cap (members), and the beta testers' real-buying switch. Members' execution switch stays off. */
export const adminAiSaveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settingsInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    if (data.oneTapMemberMaxUsd != null && data.oneTapLimitUsd > data.oneTapMemberMaxUsd) throw new Error("The default one-tap limit can't be above the highest a member can set.");
    const admin = await db();
    const { error } = await admin.from("ai_settings").update({
      one_tap_limit_usd: data.oneTapLimitUsd, max_commit_tsd: data.maxCommitTsd, updated_at: new Date().toISOString(),
      ...(data.oneTapMemberMaxUsd == null ? {} : { one_tap_member_max_usd: data.oneTapMemberMaxUsd }),
      ...(data.testerExecution === undefined ? {} : { admin_execution_enabled: data.testerExecution }),
    }).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin: run today's plan checks now (normally a daily schedule). */
export const adminAiRunChecks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { runDailyChecks } = await import("./ai.server");
    return runDailyChecks();
  });
