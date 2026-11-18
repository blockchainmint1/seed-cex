import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/lib/admin-guard";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AI_CATALOG, aiPocketFor, catalogByGecko } from "./catalog";
import { cleanSettings, lockBlocker } from "./lock-rules";
import type { PlanSettings } from "./plan";

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

const POCKET_NAMES: Record<string, string> = { BTC: "Bitcoin", LTC: "Litecoin", EVM: "Ethereum", DOGE: "Dogecoin", BCH: "Bitcoin Cash", XRP: "XRP", TRX: "TRON", SOL: "Solana" };

// ---------------- members ----------------

export type MyAiPlan = {
  id: string; name: string; status: string; commitTsd: number; lockedAt: string; telegramDaily: boolean;
  settings: PlanSettings;
  lastCheck: { day: string; message: string; sentAt: string | null } | null;
  /** Up to 14 most recent daily checks, newest first. */
  history: { day: string; message: string; sentAt: string | null }[];
};

/** Signed-in: my locked plans, latest daily check, limits, and whether my pocket is linked. */
export const getMyAiPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: plans }, { data: checks }, telegram] = await Promise.all([
      supabase.from("ai_plans").select("id, name, status, commit_tsd, locked_at, telegram_daily, settings").order("locked_at", { ascending: false }),
      supabase.from("ai_plan_checks").select("plan_id, day, message, sent_at").order("day", { ascending: false }).limit(300),
      supabase.from("profiles").select("telegram_verified").eq("id", userId).maybeSingle(),
    ]);
    const { aiSettings } = await import("./ai.server");
    const { swapSendContext } = await import("@/lib/xchain/send.server");
    const [settings, ctx] = await Promise.all([aiSettings(), swapSendContext(userId)]);
    const history = new Map<string, { day: string; message: string; sentAt: string | null }[]>();
    for (const c of checks ?? []) {
      const list = history.get(c.plan_id) ?? [];
      if (list.length < 14) list.push({ day: c.day, message: c.message, sentAt: c.sent_at });
      history.set(c.plan_id, list);
    }
    return {
      plans: (plans ?? []).map((p): MyAiPlan => ({
        id: p.id, name: p.name, status: p.status, commitTsd: Number(p.commit_tsd), lockedAt: p.locked_at,
        telegramDaily: p.telegram_daily, settings: p.settings as unknown as PlanSettings,
        lastCheck: history.get(p.id)?.[0] ?? null, history: history.get(p.id) ?? [],
      })),
      limits: { maxCommitTsd: settings.maxCommitTsd, oneTapLimitUsd: settings.oneTapLimitUsd },
      executionEnabled: settings.executionEnabled,
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
    const blocker = lockBlocker({ name: data.name, commitTsd: data.commitTsd, settings, maxCommitTsd: limits.maxCommitTsd, activePlans: count ?? 0, missingPockets: missing });
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
    const blocker = lockBlocker({ name, commitTsd, settings, maxCommitTsd: limits.maxCommitTsd, activePlans: count ?? 0, missingPockets: missing });
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
    return { ok: true };
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

const settingsInput = z.object({ oneTapLimitUsd: z.number().min(0).max(1000), maxCommitTsd: z.number().min(10).max(100000) });

/** Admin: one-tap Telegram limit and the per-plan TSD cap. The execution switch stays off until buying is built and audited. */
export const adminAiSaveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settingsInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const admin = await db();
    const { error } = await admin.from("ai_settings").update({ one_tap_limit_usd: data.oneTapLimitUsd, max_commit_tsd: data.maxCommitTsd, updated_at: new Date().toISOString() }).eq("id", 1);
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
