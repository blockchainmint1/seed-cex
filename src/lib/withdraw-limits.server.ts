/**
 * Reads withdrawal levels, member history and admin overrides (server only).
 * The rules that turn these into limits live in withdraw-limits.ts (pure, tested).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasTwoFactor, twoFactorUserIds } from "./two-factor.server";
import { memberLimits, type MemberLimits, type WithdrawHistory, type WithdrawOverride, type WithdrawTier } from "./withdraw-limits";

const DAY_MS = 86_400_000;

export async function loadTiers(): Promise<WithdrawTier[]> {
  const { data, error } = await supabaseAdmin.from("withdrawal_tiers").select("*").order("level");
  if (error) throw new Error("Couldn't load withdrawal levels.");
  return (data ?? []).map((t) => ({
    level: t.level, name: t.name, perWithdrawalUsd: Number(t.per_withdrawal_usd), dailyUsd: Number(t.daily_usd), holdHours: t.hold_hours,
    minAccountDays: t.min_account_days, minWithdrawals: t.min_withdrawals, minWithdrawnUsd: Number(t.min_withdrawn_usd), minTrades: t.min_trades,
    requires2fa: t.requires_2fa,
  }));
}

const accountDays = (createdAt: string | null | undefined, now: number) =>
  createdAt ? Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / DAY_MS)) : 0;

/** One member's history: account age, finished withdrawals, dollars withdrawn, finished trades, two-factor on. */
export async function loadHistory(userId: string): Promise<WithdrawHistory> {
  const [{ data: prof }, { data: wd }, { count: p2p }, twoFactor] = await Promise.all([
    supabaseAdmin.from("profiles").select("created_at, trades_completed").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("pocket_withdrawals").select("amount_usd").eq("user_id", userId).in("status", ["sent", "confirmed"]),
    supabaseAdmin.from("p2p_trades").select("id", { count: "exact", head: true }).eq("status", "released").or(`buyer_id.eq.${userId},seller_id.eq.${userId}`),
    hasTwoFactor(userId),
  ]);
  return {
    accountDays: accountDays(prof?.created_at, Date.now()),
    withdrawals: wd?.length ?? 0,
    withdrawnUsd: Math.round((wd ?? []).reduce((s, w) => s + Number(w.amount_usd), 0) * 100) / 100,
    trades: (prof?.trades_completed ?? 0) + (p2p ?? 0),
    twoFactor,
  };
}

export async function loadOverride(userId: string): Promise<WithdrawOverride> {
  const { data, error } = await supabaseAdmin.from("withdrawal_limit_overrides").select("tier_level, frozen, note").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Couldn't load withdrawal limits.");
  return data ? { tierLevel: data.tier_level, frozen: data.frozen, note: data.note } : null;
}

/** The member's limits right now. Throws (fails closed) when levels can't be read. */
export async function limitsFor(userId: string): Promise<MemberLimits & { history: WithdrawHistory; tester: boolean }> {
  const [tiers, history, override] = await Promise.all([loadTiers(), loadHistory(userId), loadOverride(userId)]);
  const l = memberLimits(tiers, history, override);
  if (!l) throw new Error("Withdrawal levels aren't set up, so withdrawals are closed. Contact support@honest.money.");
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "beta"]).limit(1);
  const tester = Boolean(roles?.length);
  const { testerLimits } = await import("./withdraw-limits");
  return { ...(tester ? testerLimits(l) : l), history, tester };
}

/** Everyone's history at once, for the admin table. */
export async function loadAllHistories(): Promise<Map<string, WithdrawHistory>> {
  const now = Date.now();
  const [{ data: profs }, { data: wd }, { data: p2p }, twoFactor] = await Promise.all([
    supabaseAdmin.from("profiles").select("id, created_at, trades_completed"),
    supabaseAdmin.from("pocket_withdrawals").select("user_id, amount_usd").in("status", ["sent", "confirmed"]).limit(10000),
    supabaseAdmin.from("p2p_trades").select("buyer_id, seller_id").eq("status", "released").limit(10000),
    twoFactorUserIds(),
  ]);
  const out = new Map<string, WithdrawHistory>();
  for (const p of profs ?? []) out.set(p.id, { accountDays: accountDays(p.created_at, now), withdrawals: 0, withdrawnUsd: 0, trades: p.trades_completed ?? 0, twoFactor: twoFactor.has(p.id) });
  for (const w of wd ?? []) {
    const h = out.get(w.user_id);
    if (h) { h.withdrawals++; h.withdrawnUsd = Math.round((h.withdrawnUsd + Number(w.amount_usd)) * 100) / 100; }
  }
  for (const t of p2p ?? []) for (const id of new Set([t.buyer_id, t.seller_id])) { const h = out.get(id); if (h) h.trades++; }
  return out;
}
