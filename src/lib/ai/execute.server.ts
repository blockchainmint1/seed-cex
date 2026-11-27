/**
 * Seeds AI real buying — server side. Server-only.
 *
 * Flow for a plan with real buying on (admins only for now):
 *  1. The daily check (or turning real buying on) turns the plan's target weights into
 *     queued swaps (ai_plan_moves) and asks the owner: one tap in Telegram for small
 *     days, a Confirm button on Seeds for bigger ones. Nothing is sent before that.
 *  2. The every-minute job starts the approved swaps one at a time as ordinary TSD
 *     routes (startTsdRoute: fresh quote, swap limits, own-pocket only, free-TSD check)
 *     and records what each one delivered. A move that fails stops the rest of that day.
 *  3. The plan's ledger (TSD left + coin units) comes only from finished swaps.
 */
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { swapCoin } from "@/lib/xchain/assets";
import { swapLimitsFor } from "@/lib/xchain/send-rules";
import { routeCoinProblem, routePockets } from "@/lib/xchain/tsd-route";
import {
  aiButtonData, aiButtonOk, aiTapDecision, effectiveOneTapLimit, EXEC_TTL_MS, ledgerFrom, ledgerValue, moveAmountNow, oneTapAllowed,
  parseAiButton, planRealMoves, realBuyingBlocker, type DoneMove, type Ledger, type MoveSide,
} from "./execute-rules";
import { decisionKind, decisionMessage, type DecisionButton, type DecisionKind, type DecisionRow } from "./decision-message";
import { buyNowTsd, canBuyNow, coinsWaiting, planWaitingInTsd } from "./start-now";
import type { PlanSettings } from "./plan";
import { currentAiMessage, interruptedStartDecision, planSwapAmount, runAiStart } from "./start-recovery";

const SITE = "https://seeds.honest.money";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const units = (n: number) => Number(n.toFixed(8)).toString();
const TERMINAL = ["done", "refunded", "kept_usdc", "failed"];

type PlanRow = { id: string; user_id: string; name: string; status: string; commit_tsd: number; settings: unknown; execute: boolean };

/** Beta testers: members admins switched on, plus every admin. */
export async function isTesterUser(userId: string): Promise<boolean> {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "beta"]).limit(1);
  return Boolean(data?.length);
}

async function execSettings() {
  const { data } = await db.from("ai_settings").select("execution_enabled, admin_execution_enabled, one_tap_limit_usd, one_tap_member_max_usd").eq("id", 1).maybeSingle();
  return {
    members: data?.execution_enabled === true,
    admins: data?.admin_execution_enabled !== false,
    oneTapLimitUsd: Number(data?.one_tap_limit_usd ?? 50),
    oneTapMemberMaxUsd: Number(data?.one_tap_member_max_usd ?? 1000),
  };
}

/** A member's one-tap Telegram limit: their own (capped at the admin's highest) or the admin default. */
export async function oneTapLimitFor(userId: string): Promise<{ limit: number; own: number | null; adminDefault: number; adminMax: number }> {
  const [s, { data: prof }] = await Promise.all([execSettings(), db.from("profiles").select("one_tap_limit_usd").eq("id", userId).maybeSingle()]);
  const own = prof?.one_tap_limit_usd == null ? null : Number(prof.one_tap_limit_usd);
  return { limit: effectiveOneTapLimit({ adminDefault: s.oneTapLimitUsd, adminMax: s.oneTapMemberMaxUsd, member: own }), own, adminDefault: s.oneTapLimitUsd, adminMax: s.oneTapMemberMaxUsd };
}

/** Plan coin id (CoinGecko id) → swap coin id, for every coin in the plan. */
async function swapIds(coinIds: string[]): Promise<Map<string, string | null>> {
  const { data } = await db.from("ai_coins").select("id, swap_coin, symbol").in("id", coinIds.length ? coinIds : ["-"]);
  return new Map((data ?? []).map((c) => [c.id, c.swap_coin]));
}

async function symbols(): Promise<Map<string, string>> {
  const { data } = await db.from("ai_coins").select("id, symbol");
  return new Map((data ?? []).map((c) => [c.id, c.symbol.toUpperCase()]));
}

/** Latest daily close per coin (the prices the plan check used). */
async function latestPrices(coinIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.all(coinIds.map(async (id) => {
    const { data } = await db.from("ai_daily_prices").select("close").eq("coin_id", id).order("day", { ascending: false }).limit(1).maybeSingle();
    if (data) out[id] = Number(data.close);
  }));
  return out;
}

export async function planLedger(plan: { id: string; commit_tsd: number }): Promise<Ledger> {
  const { data } = await db.from("ai_plan_moves").select("side, coin_id, amount_in, amount_out").eq("plan_id", plan.id).eq("status", "done");
  const done: DoneMove[] = (data ?? []).map((m) => ({ side: m.side as MoveSide, coin: m.coin_id, amountIn: Number(m.amount_in ?? 0), amountOut: Number(m.amount_out ?? 0) }));
  return ledgerFrom(Number(plan.commit_tsd), done);
}

/** QA-0008: the plan's positions from its own finished Seeds trades, valued at the newest daily close. */
export async function planPositions(planId: string) {
  const { positionsFrom } = await import("./positions");
  const { data } = await db.from("ai_plan_moves").select("side, coin_id, amount_in, amount_out, finished_at").eq("plan_id", planId).eq("status", "done").order("finished_at", { ascending: true });
  const moves = (data ?? []).map((m) => ({ side: m.side as "buy" | "sell", coin: m.coin_id, amountIn: Number(m.amount_in ?? 0), amountOut: Number(m.amount_out ?? 0) }));
  const prices = await latestPrices([...new Set(moves.map((m) => m.coin))]);
  return positionsFrom(moves, prices);
}

/** Why this plan can't buy for real right now, or null. */
export async function planRealBlocker(plan: PlanRow): Promise<string | null> {
  const [s, admin] = await Promise.all([execSettings(), isTesterUser(plan.user_id)]);
  const coins = ((plan.settings as { coins?: string[] })?.coins ?? []).filter((c) => c !== "tsd");
  const ids = await swapIds(coins);
  const syms = await symbols();
  const unroutable: string[] = [];
  const needed = new Set<string>();
  for (const c of coins) {
    const sc = ids.get(c) ? swapCoin(ids.get(c)!) : null;
    if (!sc || routeCoinProblem("buy", sc) || routeCoinProblem("sell", sc)) { unroutable.push(syms.get(c) ?? c); continue; }
    for (const p of [...routePockets("buy", sc), ...routePockets("sell", sc)]) needed.add(p);
  }
  const { loadLink } = await import("@/lib/xchain/send.server");
  const link = await loadLink(plan.user_id);
  return realBuyingBlocker({
    isAdmin: admin, adminExecutionOn: s.admins, membersExecutionOn: s.members, planStatus: plan.status, unroutableCoins: unroutable,
    link: link ? { mode: link.mode, hasKey: link.hasKey, pockets: link.pockets as string[] } : null, neededPockets: [...needed],
  });
}

/** Stop everything still queued for a plan (paused, ended, real buying off, or replaced by a newer day). */
export async function cancelOpenPlanMoves(planId: string, why: string, exceptCheckId?: string) {
  const now = new Date().toISOString();
  let q = db.from("ai_plan_moves").update({ status: "cancelled", error: why, finished_at: now, updated_at: now }).eq("plan_id", planId).eq("status", "queued");
  if (exceptCheckId) q = q.neq("check_id", exceptCheckId);
  await q;
  let c = db.from("ai_plan_checks").update({ exec_status: "cancelled", exec_decided_at: now }).eq("plan_id", planId).in("exec_status", ["waiting", "approved"]);
  if (exceptCheckId) c = c.neq("id", exceptCheckId);
  await c;
}

export type Prepared = { moves: number; total: number; oneTap: boolean; asked: boolean; reason?: string };

/**
 * Turn one day's check into queued real swaps and ask the owner in one Telegram
 * message ("you're X, the rule says Y, what would you like to do"). Safe to repeat:
 * a check that already has an answer or moves is left alone. With ask:false nothing
 * is sent (the caller answers for the owner, e.g. right after an override tap). A
 * stay-in-TSD day with no trades asks only when askWaiting isn't false.
 */
export async function prepareRealMoves(checkId: string, opts: { ask?: boolean; askWaiting?: boolean } = {}): Promise<Prepared> {
  const none = (reason: string): Prepared => ({ moves: 0, total: 0, oneTap: false, asked: false, reason });
  const { data: check } = await db.from("ai_plan_checks").select("id, plan_id, user_id, day, suggestion, exec_status").eq("id", checkId).maybeSingle();
  if (!check || check.exec_status !== "none") return none("already prepared");
  const { data: plan } = await db.from("ai_plans").select("id, user_id, name, status, commit_tsd, settings, execute").eq("id", check.plan_id).maybeSingle();
  if (!plan?.execute) return none("real buying off");
  const blocker = await planRealBlocker(plan as PlanRow);
  if (blocker) return none(blocker);

  const sug = (check.suggestion ?? {}) as { moves?: unknown[]; current?: Record<string, number> };
  const targets = sug.current ?? {};
  const ledger = await planLedger(plan);
  const { count: doneCount } = await db.from("ai_plan_moves").select("id", { count: "exact", head: true }).eq("plan_id", plan.id).eq("status", "done");
  const settings = plan.settings as unknown as PlanSettings;
  const coins = [...new Set([...Object.keys(targets), ...Object.keys(ledger.units), ...settings.coins])].filter((c) => c !== "tsd");
  const prices = await latestPrices(coins);
  const planned = planRealMoves({
    ledger, targets, prices, perSwapUsd: swapLimitsFor(await isTesterUser(plan.user_id)).perSwapUsd,
    // First real day (nothing bought yet) or a day the plan itself traded: follow it fully.
    planTradedToday: (sug.moves?.length ?? 0) > 0 || !doneCount,
  });
  await cancelOpenPlanMoves(plan.id, "Replaced by a newer daily check.", check.id);
  const { limit: oneTapLimit } = await oneTapLimitFor(plan.user_id);
  const syms = await symbols();
  const ask = opts.ask !== false;
  const kind = decisionKind({ rows: planned, targets, waitingInTsd: planWaitingInTsd(settings, targets), canBuyNow: canBuyNow(settings, targets) });
  const holding = {
    tsd: ledger.tsd,
    coins: Object.entries(ledger.units).filter(([, u]) => u > 0).map(([c, u]) => ({ symbol: syms.get(c) ?? c, units: u, usd: u * (prices[c] ?? 0) })),
  };
  if (!planned.length) {
    if (ask && opts.askWaiting !== false && kind === "stay-in-tsd") {
      const { waitReasons, waitReasonText } = await import("./ai.server");
      const reasons = (await waitReasons(settings, coinsWaiting(settings, targets), check.day)).map(waitReasonText);
      const asked = await askOwner({
        checkId: check.id, userId: plan.user_id, kind, planName: plan.name, day: check.day, holding, reasons, rows: [], total: 0,
        oneTap: false, limit: oneTapLimit, buyNowTsd: buyNowTsd(settings, ledgerValue(ledger, prices), targets),
      });
      return { ...none("nothing to trade"), asked };
    }
    return none("nothing to trade");
  }

  const ids = await swapIds(coins);
  const rows = planned.map((m, i) => ({
    check_id: check.id, plan_id: plan.id, user_id: plan.user_id, seq: i, side: m.side, coin_id: m.coin,
    swap_coin: ids.get(m.coin)!, usd: Math.round(m.usd * 100) / 100, amount: m.amount,
  }));
  const { error } = await db.from("ai_plan_moves").insert(rows);
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return none("already prepared");
    throw new Error(error.message);
  }
  const total = rows.reduce((a, r) => a + r.usd, 0);
  const oneTap = oneTapAllowed(total, oneTapLimit);
  const expires = new Date(Date.now() + EXEC_TTL_MS).toISOString();
  const { data: claimed } = await db.from("ai_plan_checks").update({ exec_status: "waiting", exec_total_usd: Math.round(total * 100) / 100, exec_expires_at: expires })
    .eq("id", check.id).eq("exec_status", "none").select("id");
  if (!claimed?.length) return none("already prepared");
  let reasons: string[] = [];
  if (kind === "sell-to-tsd") {
    const { waitReasons, waitReasonText } = await import("./ai.server");
    const cash = [...new Set(rows.filter((r) => r.side === "sell" && !((targets[r.coin_id] ?? 0) > 0.001)).map((r) => r.coin_id))];
    reasons = (await waitReasons(settings, cash, check.day)).map((r) => r.reason === "stop-loss" ? `${r.symbol} hit its ${settings.stopLoss}% stop-loss` : waitReasonText(r));
  }
  const asked = ask ? await askOwner({
    checkId: check.id, userId: plan.user_id, kind: kind ?? "trade", planName: plan.name, day: check.day, holding, reasons,
    rows: rows.map((r) => ({ side: r.side, symbol: syms.get(r.coin_id) ?? r.coin_id, amount: r.amount, usd: r.usd })), total, oneTap, limit: oneTapLimit,
  }) : false;
  return { moves: rows.length, total, oneTap, asked };
}

/** Telegram inline keyboard from the decision buttons (choice buttons are signed for this check and owner). */
async function keyboard(buttons: DecisionButton[][], checkId: string, userId: string) {
  const { telegramActionKey } = await import("@/lib/telegram.server");
  const key = await telegramActionKey();
  return {
    inline_keyboard: await Promise.all(buttons.map((row) => Promise.all(row.map(async (b) =>
      "url" in b ? { text: b.label, url: b.url } : { text: b.label, callback_data: await aiButtonData(key, b.choice, checkId, userId) })))),
  };
}

/** Send the check's question to the owner's verified Telegram chat. True when it was sent. */
async function askOwner(p: {
  checkId: string; userId: string; kind: DecisionKind; planName: string; day: string;
  holding: { tsd: number; coins: { symbol: string; units: number; usd: number }[] };
  reasons: string[]; rows: DecisionRow[]; total: number; oneTap: boolean; limit: number; buyNowTsd?: number;
}): Promise<boolean> {
  const { telegramConfigured, telegramCall } = await import("@/lib/telegram.server");
  if (!telegramConfigured()) return false;
  const { data: prof } = await db.from("profiles").select("telegram_chat_id, telegram_verified").eq("id", p.userId).maybeSingle();
  if (!prof?.telegram_verified || !prof.telegram_chat_id) return false;
  const { chatTrusted } = await import("@/lib/step-up/step-up.server");
  if (!(await chatTrusted(p.userId, prof.telegram_chat_id))) return false; // H1b: unconfirmed chats can't approve buys
  const msg = decisionMessage({ ...p, oneTapLimit: p.limit, siteUrl: `${SITE}/account/ai` });
  const chatId = String(prof.telegram_chat_id);
  try {
    const sent = (await telegramCall("sendMessage", {
      chat_id: chatId, text: msg.text, parse_mode: "HTML", disable_web_page_preview: true,
      reply_markup: await keyboard(msg.buttons, p.checkId, p.userId),
    })) as { message_id?: number } | undefined;
    await db.from("ai_plan_checks").update({ exec_telegram_chat_id: chatId, exec_telegram_message_id: sent?.message_id ?? null, sent_at: new Date().toISOString() }).eq("id", p.checkId);
    return true;
  } catch (e) {
    console.error("[ai-exec] telegram ask failed", e);
    return false;
  }
}

/** Owner's answer (Seeds page or Telegram). Compare-and-set: only a waiting, unexpired day can be decided. */
export async function decideCheck(userId: string, checkId: string, choice: "yes" | "no", via: "site" | "telegram"): Promise<"approved" | "declined"> {
  const now = new Date().toISOString();
  const { data } = await db.from("ai_plan_checks")
    .update({ exec_status: choice === "yes" ? "approved" : "declined", exec_decided_at: now, exec_decided_via: via })
    .eq("id", checkId).eq("user_id", userId).eq("exec_status", "waiting").gt("exec_expires_at", now).select("id, plan_id");
  if (!data?.length) throw new Error("These trades aren't waiting for an answer any more.");
  if (choice === "no") {
    await db.from("ai_plan_moves").update({ status: "skipped", error: "You skipped this day.", finished_at: now, updated_at: now }).eq("check_id", checkId).eq("status", "queued");
    return "declined";
  }
  return "approved";
}

/**
 * Telegram override ("keep holding" on a sell-to-TSD day, "buy now" on a stay-in-TSD day):
 * redo today's check as an override day, then start whatever it now needs within the
 * one-tap limit (bigger: confirm on Seeds). Already verified as the owner's own tap.
 */
async function overrideFromTelegram(
  check: { id: string; user_id: string }, choice: string,
  answer: (t: string, alert?: boolean) => Promise<unknown>, edit: (t: string) => Promise<unknown>,
): Promise<string> {
  try {
    const { data: row } = await db.from("ai_plan_checks").select("plan_id").eq("id", check.id).single();
    const { data: plan } = await db.from("ai_plans").select("id, user_id, name, status, commit_tsd, settings, execute").eq("id", row!.plan_id).single();
    if (!plan?.execute || plan.status !== "locked") throw new Error("Real buying is off for this plan.");
    const blocker = await planRealBlocker(plan as PlanRow);
    if (blocker) throw new Error(blocker);
    const { overridePlanDay } = await import("./ai.server");
    const checkId = await overridePlanDay(plan.id, check.user_id);
    const r = await prepareRealMoves(checkId, { ask: false });
    const what = choice === "keep" ? "✋ <b>Override: keeping your coins.</b>" : "⚡ <b>Override: buying now.</b>";
    const clock = "Your rules look forward from today.";
    if (!r.moves) { await edit(`${what} Nothing needs to trade. ${clock}`); await answer("Override saved."); return "override_saved"; }
    if (r.oneTap) {
      await decideCheck(check.user_id, checkId, "yes", "telegram");
      await advanceAiMoves({ userId: check.user_id }).catch((e) => console.error("[ai-exec] override start failed", e));
      await edit(`${what} Seeds is starting the trades now (about ${usd(r.total)}), one at a time. ${clock}`);
      await answer("Override saved. Starting now.");
      return "override_started";
    }
    await edit(`${what} The trades come to about ${usd(r.total)}, over your one-tap limit — confirm them on Seeds: ${SITE}/account/ai\n${clock}`);
    await answer("Override saved. Confirm the trades on Seeds.", true);
    return "override_needs_site";
  } catch (e) {
    await answer(e instanceof Error ? e.message : "Couldn't override.", true);
    return "failed";
  }
}

type CallbackQuery = { id?: string; data?: string; message?: { message_id?: number; chat?: { id?: number; type?: string } } };

/** Telegram "Do it" / "Skip today". Returns an outcome label, or null when the button isn't ours. */
export async function handleAiTap(cq: CallbackQuery): Promise<string | null> {
  const parsed = parseAiButton(cq.data);
  if (!parsed) return null;
  const { telegramActionKey, telegramCall } = await import("@/lib/telegram.server");
  const answer = (text: string, alert = false) =>
    cq.id ? telegramCall("answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: alert }).catch(() => {}) : Promise.resolve();
  const { data: check } = await db.from("ai_plan_checks").select("id, user_id, exec_status, exec_total_usd, exec_expires_at, exec_telegram_message_id").eq("id", parsed.checkId).maybeSingle();
  if (!check || !currentAiMessage(check.exec_telegram_message_id, cq.message?.message_id)) {
    await answer("This request was replaced. Review the current trades on Seeds.", true);
    return "refused";
  }
  const { data: owner } = check ? await db.from("profiles").select("telegram_chat_id, telegram_verified").eq("id", check.user_id).maybeSingle() : { data: null };
  const oneTapLimit = check ? (await oneTapLimitFor(check.user_id)).limit : 0;
  const decision = aiTapDecision({
    choice: parsed.choice,
    signatureOk: check ? await aiButtonOk(await telegramActionKey(), parsed, check.user_id) : false,
    privateChat: cq.message?.chat?.type === "private",
    tapChatId: String(cq.message?.chat?.id ?? ""),
    ownerChatId: owner?.telegram_chat_id ? String(owner.telegram_chat_id) : null,
    ownerChatVerified: owner?.telegram_verified === true && check != null
      && await (await import("@/lib/step-up/step-up.server")).chatTrusted(check.user_id, owner?.telegram_chat_id),
    status: check?.exec_status ?? "missing",
    oneTap: oneTapAllowed(Number(check?.exec_total_usd ?? 0), oneTapLimit),
    expiresAtMs: check?.exec_expires_at ? Date.parse(check.exec_expires_at) : 0,
    nowMs: Date.now(),
  });
  const edit = (text: string) => cq.message?.chat?.id && cq.message.message_id
    ? telegramCall("editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text, parse_mode: "HTML" }).catch(() => {})
    : Promise.resolve();
  if (decision === "refuse" || !check) { await answer("This button isn't valid for this chat.", true); return "refused"; }
  if (decision === "already_decided") { await answer(`Already ${check.exec_status}.`); return "already_decided"; }
  if (decision === "expired") { await answer("This request already ended. Nothing was traded.", true); return "expired"; }
  if (decision === "needs_site") { await answer("This one is over your one-tap limit. Confirm it on Seeds → Account → AI strategies.", true); return "needs_site"; }
  if (decision === "stay") {
    await edit("✅ <b>Staying in TSD</b> — following your plan's rule. You'll get the next check as usual.");
    await answer("Staying in TSD.");
    return "stayed";
  }
  if (decision === "override") return overrideFromTelegram(check, parsed.choice, answer, edit);
  try {
    const out = await decideCheck(check.user_id, check.id, parsed.choice === "yes" ? "yes" : "no", "telegram");
    if (out === "declined") { await edit("🛑 <b>Skipped</b> — no AI trades today. Nothing was sent."); await answer("Skipped. Nothing was traded."); return "declined"; }
    await edit("✅ <b>Approved</b> — Seeds is starting today's AI trades from your pocket, one at a time. You'll get a message as each one finishes.");
    await answer("Approved. Starting now.");
    return "approved";
  } catch (e) {
    await answer(e instanceof Error ? e.message : "Couldn't record that.", true);
    return "failed";
  }
}

/* ------------------------------- the job ------------------------------- */

async function notify(userId: string, text: string) {
  try {
    const { notifyUser } = await import("@/lib/telegram.server");
    await notifyUser(userId, "notify_settlement", text);
  } catch (e) { console.error("[ai-exec] alert failed", e); }
}

async function finishCheckIfDone(checkId: string) {
  const { data: moves } = await db.from("ai_plan_moves").select("status").eq("check_id", checkId);
  if (!moves?.length || moves.some((m) => ["queued", "starting", "running"].includes(m.status))) return;
  const allDone = moves.every((m) => m.status === "done");
  const someDone = moves.some((m) => m.status === "done");
  await db.from("ai_plan_checks").update({ exec_status: allDone ? "done" : someDone ? "partial" : "cancelled" }).eq("id", checkId).in("exec_status", ["approved", "running"]);
}

async function failMove(m: { id: string; check_id: string; user_id: string }, why: string, unstartedOnly = false) {
  const now = new Date().toISOString();
  let update = db.from("ai_plan_moves").update({ status: "failed", error: why.slice(0, 300), finished_at: now, updated_at: now })
    .eq("id", m.id).in("status", ["starting", "running"]);
  if (unstartedOnly) update = update.is("route_id", null);
  const { data: changed, error } = await update.select("id");
  if (error || !changed?.length) return; // reservation won the race, or another worker finished it
  // One step didn't finish: stop the rest of that day rather than trade on a half-done plan.
  await db.from("ai_plan_moves").update({ status: "cancelled", error: "Stopped because an earlier trade that day didn't finish.", finished_at: now, updated_at: now })
    .eq("check_id", m.check_id).eq("status", "queued");
  await finishCheckIfDone(m.check_id);
  await notify(m.user_id, `⚠️ <b>Seeds AI</b> · a plan trade didn't go through: ${esc(why)}\nThe rest of today's plan trades were stopped. Details: ${SITE}/account/ai`);
}

/** Every minute: expire, reconcile finished swaps, then start the next approved trade per member. */
export async function advanceAiMoves(opts: { userId?: string } = {}): Promise<{ started: number; finished: number }> {
  const out = { started: 0, finished: 0 };
  const now = new Date().toISOString();
  // 1. Days nobody answered.
  const { data: expired } = await db.from("ai_plan_checks").update({ exec_status: "expired" }).eq("exec_status", "waiting").lt("exec_expires_at", now).select("id");
  for (const c of expired ?? []) {
    await db.from("ai_plan_moves").update({ status: "skipped", error: "Not confirmed in time.", finished_at: now, updated_at: now }).eq("check_id", c.id).eq("status", "queued");
  }

  // 2. Running trades: read their swap.
  let rq = db.from("ai_plan_moves").select("id, check_id, user_id, side, route_id, started_at, swap_coin, amount").in("status", ["running", "starting"]);
  if (opts.userId) rq = rq.eq("user_id", opts.userId);
  const { data: active } = await rq.limit(50);
  for (const m of active ?? []) {
    if (!m.route_id) {
      // New starts link atomically. Legacy starts may have an untracked swap; a
      // similar-looking manual swap is not proof it belongs to this basket.
      const since = new Date(Date.parse(m.started_at ?? now) - 10_000).toISOString();
      const { data: candidates, error } = await db.from("tsd_routes").select("id").eq("user_id", m.user_id).eq("coin", m.swap_coin).eq("direction", m.side).gte("created_at", since).limit(1);
      const decision = interruptedStartDecision({ lookupOk: !error, matchingRoutes: candidates?.length ?? 0, ageMs: Date.now() - Date.parse(m.started_at ?? now) });
      if (decision === "stop") await failMove(m, "The start was interrupted before a swap was recorded. Nothing was sent for this trade. Request a retry on Account → AI strategies, then confirm again.", true);
      if (decision === "review") await db.from("ai_plan_moves").update({ error: "A matching swap exists but its basket link is uncertain. Review required; Seeds will not start another swap.", updated_at: now }).eq("id", m.id).is("route_id", null).eq("status", "starting");
      continue;
    }
    const { data: r } = await db.from("tsd_routes").select("stage, amount_in, amount_out, shown_out, error").eq("id", m.route_id).eq("user_id", m.user_id).maybeSingle();
    if (!r || !TERMINAL.includes(r.stage)) continue;
    if (r.stage === "done") {
      await db.from("ai_plan_moves").update({ status: "done", amount_in: r.amount_in, amount_out: r.amount_out ?? r.shown_out, finished_at: now, updated_at: now }).eq("id", m.id).in("status", ["running", "starting"]);
      await finishCheckIfDone(m.check_id);
      out.finished++;
    } else {
      await failMove(m, r.error ?? (r.stage === "kept_usdc" ? "The swap stopped and the USDC is in your EVM pocket." : r.stage === "refunded" ? "The swap was refunded to your pocket." : "The swap failed."));
      out.finished++;
    }
  }

  // 3. Next approved trade, one per member, oldest first.
  let nq = db.from("ai_plan_moves").select("id, check_id, plan_id, user_id, seq, side, coin_id, swap_coin, amount, created_at").eq("status", "queued").order("created_at").order("seq");
  if (opts.userId) nq = nq.eq("user_id", opts.userId);
  const { data: queued } = await nq.limit(50);
  const seen = new Set<string>();
  for (const m of queued ?? []) {
    if (seen.has(m.user_id)) continue;
    seen.add(m.user_id);
    const { data: check } = await db.from("ai_plan_checks").select("exec_status").eq("id", m.check_id).maybeSingle();
    if (!check || !["approved", "running"].includes(check.exec_status)) continue;
    // Earlier trade in the same day still queued? Keep order.
    const { data: earlier } = await db.from("ai_plan_moves").select("id").eq("check_id", m.check_id).eq("status", "queued").lt("seq", m.seq).limit(1);
    if (earlier?.length) continue;
    const { count: busy } = await db.from("ai_plan_moves").select("id", { count: "exact", head: true }).eq("user_id", m.user_id).in("status", ["starting", "running"]);
    if (busy) continue;
    const { count: openRoutes } = await db.from("tsd_routes").select("id", { count: "exact", head: true }).eq("user_id", m.user_id).not("stage", "in", "(done,refunded,kept_usdc,failed)");
    if (openRoutes) continue; // the member's own swap is running; wait for it
    if (await startMove(m)) out.started++;
  }
  return out;
}

async function startMove(m: { id: string; check_id: string; plan_id: string; user_id: string; side: string; coin_id: string; swap_coin: string; amount: number }): Promise<boolean> {
  const now = new Date().toISOString();
  const { data: plan } = await db.from("ai_plans").select("id, user_id, name, status, commit_tsd, settings, execute").eq("id", m.plan_id).maybeSingle();
  if (!plan?.execute || plan.status !== "locked") {
    await db.from("ai_plan_moves").update({ status: "cancelled", error: "Real buying was switched off or the plan paused.", finished_at: now, updated_at: now }).eq("id", m.id).eq("status", "queued");
    await finishCheckIfDone(m.check_id);
    return false;
  }
  const blocker = await planRealBlocker(plan as PlanRow);
  if (blocker) {
    const { data: c } = await db.from("ai_plan_moves").update({ status: "starting", started_at: now, updated_at: now }).eq("id", m.id).eq("status", "queued").select("id");
    if (c?.length) await failMove(m, blocker);
    return false;
  }
  const ledger = await planLedger(plan);
  const price = (await latestPrices([m.coin_id]))[m.coin_id] ?? null;
  const amount = moveAmountNow({ side: m.side as MoveSide, coin: m.coin_id, amount: Number(m.amount) }, ledger, price);
  if (amount == null) {
    await db.from("ai_plan_moves").update({ status: "skipped", error: "Too small after earlier trades.", finished_at: now, updated_at: now }).eq("id", m.id).eq("status", "queued");
    await finishCheckIfDone(m.check_id);
    return false;
  }
  // Claim it (one unfinished plan trade per member is also enforced by a unique index).
  const { data: claimed, error: claimErr } = await db.from("ai_plan_moves").update({ status: "starting", started_at: now, updated_at: now }).eq("id", m.id).eq("status", "queued").select("id");
  if (claimErr || !claimed?.length) return false;
  await db.from("ai_plan_checks").update({ exec_status: "running" }).eq("id", m.check_id).eq("exec_status", "approved");
  return runAiStart({ start: async () => {
    const coin = swapCoin(m.swap_coin);
    if (!coin) throw new Error("Unknown coin.");
    const { startTsdRoute } = await import("@/lib/xchain/tsd-route.server");
    const direction = m.side as "buy" | "sell";
    const amt = planSwapAmount(direction, amount);
    // The plan owner's own limits apply (audit #3 A3): testers get none, members get theirs.
    await startTsdRoute(m.user_id, await isTesterUser(m.user_id), { direction, coin: coin.id, amount: amt, shownOut: 0 }, { waitForFirstSend: false, aiMoveId: m.id });
  }, readLink: async () => {
    const { data, error } = await db.from("ai_plan_moves").select("route_id").eq("id", m.id).eq("user_id", m.user_id).maybeSingle();
    return { ok: !error && Boolean(data), routeId: data?.route_id ?? null };
  }, fail: (reason) => failMove(m, reason, true) });
}
