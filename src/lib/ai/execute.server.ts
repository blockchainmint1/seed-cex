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
  aiButtonData, aiButtonOk, aiTapDecision, EXEC_TTL_MS, ledgerFrom, ledgerValue, moveAmountNow, oneTapAllowed,
  parseAiButton, planRealMoves, realBuyingBlocker, type DoneMove, type Ledger, type MoveSide,
} from "./execute-rules";

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
  const { data } = await db.from("ai_settings").select("execution_enabled, admin_execution_enabled, one_tap_limit_usd").eq("id", 1).maybeSingle();
  return {
    members: data?.execution_enabled === true,
    admins: data?.admin_execution_enabled !== false,
    oneTapLimitUsd: Number(data?.one_tap_limit_usd ?? 50),
  };
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

/**
 * Turn one day's check into queued real swaps and ask the owner. Safe to repeat:
 * a check that already has an answer or moves is left alone.
 */
export async function prepareRealMoves(checkId: string): Promise<{ moves: number; reason?: string }> {
  const { data: check } = await db.from("ai_plan_checks").select("id, plan_id, user_id, day, suggestion, exec_status").eq("id", checkId).maybeSingle();
  if (!check || check.exec_status !== "none") return { moves: 0, reason: "already prepared" };
  const { data: plan } = await db.from("ai_plans").select("id, user_id, name, status, commit_tsd, settings, execute").eq("id", check.plan_id).maybeSingle();
  if (!plan?.execute) return { moves: 0, reason: "real buying off" };
  const blocker = await planRealBlocker(plan as PlanRow);
  if (blocker) return { moves: 0, reason: blocker };

  const sug = (check.suggestion ?? {}) as { moves?: unknown[]; current?: Record<string, number> };
  const targets = sug.current ?? {};
  const ledger = await planLedger(plan);
  const { count: doneCount } = await db.from("ai_plan_moves").select("id", { count: "exact", head: true }).eq("plan_id", plan.id).eq("status", "done");
  const coins = [...new Set([...Object.keys(targets), ...Object.keys(ledger.units)])].filter((c) => c !== "tsd");
  const prices = await latestPrices(coins);
  const planned = planRealMoves({
    ledger, targets, prices, perSwapUsd: swapLimitsFor(await isTesterUser(plan.user_id)).perSwapUsd,
    // First real day (nothing bought yet) or a day the plan itself traded: follow it fully.
    planTradedToday: (sug.moves?.length ?? 0) > 0 || !doneCount,
  });
  await cancelOpenPlanMoves(plan.id, "Replaced by a newer daily check.", check.id);
  if (!planned.length) return { moves: 0, reason: "nothing to trade" };

  const ids = await swapIds(coins);
  const rows = planned.map((m, i) => ({
    check_id: check.id, plan_id: plan.id, user_id: plan.user_id, seq: i, side: m.side, coin_id: m.coin,
    swap_coin: ids.get(m.coin)!, usd: Math.round(m.usd * 100) / 100, amount: m.amount,
  }));
  const { error } = await db.from("ai_plan_moves").insert(rows);
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return { moves: 0, reason: "already prepared" };
    throw new Error(error.message);
  }
  const s = await execSettings();
  const total = rows.reduce((a, r) => a + r.usd, 0);
  const expires = new Date(Date.now() + EXEC_TTL_MS).toISOString();
  const { data: claimed } = await db.from("ai_plan_checks").update({ exec_status: "waiting", exec_total_usd: Math.round(total * 100) / 100, exec_expires_at: expires })
    .eq("id", check.id).eq("exec_status", "none").select("id");
  if (!claimed?.length) return { moves: 0, reason: "already prepared" };
  await askOwner({ checkId: check.id, userId: plan.user_id, planName: plan.name, day: check.day, rows, total, oneTap: oneTapAllowed(total, s.oneTapLimitUsd), limit: s.oneTapLimitUsd, value: ledgerValue(ledger, prices) });
  return { moves: rows.length };
}

async function askOwner(p: {
  checkId: string; userId: string; planName: string; day: string; total: number; oneTap: boolean; limit: number; value: number;
  rows: { side: string; coin_id: string; usd: number; amount: number }[];
}) {
  const { telegramConfigured, telegramCall, telegramActionKey } = await import("@/lib/telegram.server");
  if (!telegramConfigured()) return;
  const { data: prof } = await db.from("profiles").select("telegram_chat_id, telegram_verified").eq("id", p.userId).maybeSingle();
  if (!prof?.telegram_verified || !prof.telegram_chat_id) return;
  const syms = await symbols();
  const lines = [`🌱 <b>Seeds AI · ${esc(p.planName)}</b> · real trades for ${p.day}`, ""];
  for (const r of p.rows) {
    const sym = esc(syms.get(r.coin_id) ?? r.coin_id);
    lines.push(r.side === "buy" ? `• Buy ${sym} with ${units(r.amount)} TSD` : `• Sell ${units(r.amount)} ${sym} (about ${usd(r.usd)}) for TSD`);
  }
  lines.push("", `Total about ${usd(p.total)} · plan worth about ${usd(p.value)}`);
  lines.push("Each trade is a normal TSD swap from your own trading pocket, one after another.");
  if (p.oneTap) lines.push("", "Tap <b>Do it</b> to start, or Skip today. Nothing moves until you tap.");
  else lines.push("", `This is over your ${usd(p.limit)} one-tap limit, so confirm it on Seeds: ${SITE}/account/ai`);
  lines.push("This request ends in 20 hours.");
  const chatId = String(prof.telegram_chat_id);
  const key = p.oneTap ? await telegramActionKey() : "";
  const reply_markup = p.oneTap
    ? { inline_keyboard: [[
        { text: "✅ Do it", callback_data: await aiButtonData(key, "yes", p.checkId, p.userId) },
        { text: "Skip today", callback_data: await aiButtonData(key, "no", p.checkId, p.userId) },
      ]] }
    : undefined;
  try {
    const sent = (await telegramCall("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML", disable_web_page_preview: true, ...(reply_markup ? { reply_markup } : {}) })) as { message_id?: number } | undefined;
    await db.from("ai_plan_checks").update({ exec_telegram_chat_id: chatId, exec_telegram_message_id: sent?.message_id ?? null }).eq("id", p.checkId);
  } catch (e) {
    console.error("[ai-exec] telegram ask failed", e);
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

type CallbackQuery = { id?: string; data?: string; message?: { message_id?: number; chat?: { id?: number; type?: string } } };

/** Telegram "Do it" / "Skip today". Returns an outcome label, or null when the button isn't ours. */
export async function handleAiTap(cq: CallbackQuery): Promise<string | null> {
  const parsed = parseAiButton(cq.data);
  if (!parsed) return null;
  const { telegramActionKey, telegramCall } = await import("@/lib/telegram.server");
  const answer = (text: string, alert = false) =>
    cq.id ? telegramCall("answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: alert }).catch(() => {}) : Promise.resolve();
  const { data: check } = await db.from("ai_plan_checks").select("id, user_id, exec_status, exec_total_usd, exec_expires_at").eq("id", parsed.checkId).maybeSingle();
  const { data: owner } = check ? await db.from("profiles").select("telegram_chat_id, telegram_verified").eq("id", check.user_id).maybeSingle() : { data: null };
  const s = await execSettings();
  const decision = aiTapDecision({
    choice: parsed.choice,
    signatureOk: check ? await aiButtonOk(await telegramActionKey(), parsed, check.user_id) : false,
    privateChat: cq.message?.chat?.type === "private",
    tapChatId: String(cq.message?.chat?.id ?? ""),
    ownerChatId: owner?.telegram_chat_id ? String(owner.telegram_chat_id) : null,
    ownerChatVerified: owner?.telegram_verified === true,
    status: check?.exec_status ?? "missing",
    oneTap: oneTapAllowed(Number(check?.exec_total_usd ?? 0), s.oneTapLimitUsd),
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
  try {
    const out = await decideCheck(check.user_id, check.id, parsed.choice, "telegram");
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

async function failMove(m: { id: string; check_id: string; user_id: string }, why: string) {
  const now = new Date().toISOString();
  await db.from("ai_plan_moves").update({ status: "failed", error: why.slice(0, 300), finished_at: now, updated_at: now }).eq("id", m.id);
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
      // Started but the swap id wasn't recorded (job cut off): find it, never start a second one.
      const since = new Date(Date.parse(m.started_at ?? now) - 10_000).toISOString();
      const { data: r } = await db.from("tsd_routes").select("id").eq("user_id", m.user_id).eq("coin", m.swap_coin).eq("direction", m.side).gte("created_at", since).order("created_at").limit(1).maybeSingle();
      if (r) await db.from("ai_plan_moves").update({ route_id: r.id, status: "running", updated_at: now }).eq("id", m.id);
      else if (Date.now() - Date.parse(m.started_at ?? now) > 3 * 60_000) await failMove(m, "The swap didn't start.");
      continue;
    }
    const { data: r } = await db.from("tsd_routes").select("stage, amount_in, amount_out, shown_out, error").eq("id", m.route_id).maybeSingle();
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
  try {
    const coin = swapCoin(m.swap_coin);
    if (!coin) throw new Error("Unknown coin.");
    const { quoteTsdRoute, startTsdRoute } = await import("@/lib/xchain/tsd-route.server");
    const direction = m.side as "buy" | "sell";
    const amt = direction === "buy" ? amount.toFixed(2) : units(amount);
    if (direction === "buy") {
      // Going to cash doesn't set the TSD aside: the member may have spent it since. Say so plainly.
      const { loadLink } = await import("@/lib/xchain/send.server");
      const { freeTsdFor } = await import("@/lib/xchain/tsd-route.server");
      const link = await loadLink(m.user_id);
      const free = link?.addresses.TXC ? await freeTsdFor(m.user_id, link.addresses.TXC) : null;
      if (free != null && free < amount) {
        throw new Error(`Your plan wants to buy ${units(amount)} TSD of ${coin.symbol}, but your trading pocket only has ${units(free)} TSD free. Deposit more TSD into your trading pocket and the next daily check will buy back in.`);
      }
    }
    const q = await quoteTsdRoute(direction, coin, amt);
    if (!q.ok) throw new Error(q.error ?? "No route right now.");
    const row = await startTsdRoute(m.user_id, true, { direction, coin: coin.id, amount: amt, shownOut: q.out }, { waitForFirstSend: false });
    if (!row) return true; // the swap exists; the next run finds and links it (route lookup in step 2)
    await db.from("ai_plan_moves").update({ route_id: row.id, status: "running", updated_at: new Date().toISOString() }).eq("id", m.id);
    return true;
  } catch (e) {
    await failMove(m, e instanceof Error ? e.message : String(e));
    return false;
  }
}
