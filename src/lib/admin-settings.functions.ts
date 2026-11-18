import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { memberLimits, overrideMessage, tiersProblem, type WithdrawHistory, type WithdrawTier } from "./withdraw-limits";

type Ctx = { supabase: { from: (t: string) => any }; userId: string };
async function requireAdmin(context: Ctx) {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Forbidden: admin role required");
}

export type LimitMemberRow = {
  id: string;
  name: string;
  hmMemberId: string | null;
  history: WithdrawHistory;
  level: number;
  levelName: string;
  source: "earned" | "admin";
  frozen: boolean;
  note: string | null;
  perWithdrawalUsd: number;
  dailyUsd: number;
};
export type LimitEvent = { at: string; action: "tiers" | "set" | "clear"; actorName: string; targetName: string | null; text: string; note: string | null };

/** Withdrawal levels, every member's level and why, and the last 50 changes. Admins only. */
export const getWithdrawalSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadTiers, loadAllHistories } = await import("./withdraw-limits.server");
    const { PULSE_MAX_WAITING, PULSE_WITHDRAW_PILOT_ADMIN_ONLY } = await import("./pulse/withdraw-rules");
    const [tiers, histories, { data: profiles }, { data: overrides }, { data: events }] = await Promise.all([
      loadTiers(),
      loadAllHistories(),
      supabaseAdmin.from("profiles").select("id, display_name, hm_member_id"),
      supabaseAdmin.from("withdrawal_limit_overrides").select("user_id, tier_level, frozen, note"),
      supabaseAdmin.from("withdrawal_limit_events").select("actor_id, target_id, action, detail, created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    const ov = new Map((overrides ?? []).map((o) => [o.user_id, { tierLevel: o.tier_level, frozen: o.frozen, note: o.note }]));
    const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name || "Unnamed"]));
    const members: LimitMemberRow[] = [];
    for (const p of profiles ?? []) {
      const history = histories.get(p.id) ?? { accountDays: 0, withdrawals: 0, withdrawnUsd: 0, trades: 0 };
      const l = memberLimits(tiers, history, ov.get(p.id) ?? null);
      if (!l) continue;
      members.push({
        id: p.id, name: names.get(p.id)!, hmMemberId: p.hm_member_id, history,
        level: l.tier.level, levelName: l.tier.name, source: l.source, frozen: l.frozen, note: l.note,
        perWithdrawalUsd: l.perWithdrawalUsd, dailyUsd: l.dailyUsd,
      });
    }
    const levelName = (n: unknown) => tiers.find((t) => t.level === n)?.name ?? `level ${n}`;
    const history: LimitEvent[] = (events ?? []).map((e) => {
      const d = (e.detail ?? {}) as { tier?: number | null; frozen?: boolean; note?: string };
      const text = e.action === "tiers" ? "changed the withdrawal levels"
        : e.action === "clear" ? "switched back to automatic levels for"
        : [d.frozen ? "paused withdrawals for" : null, d.tier != null ? `set ${levelName(d.tier)} for` : null].filter(Boolean).join(" and ");
      return {
        at: e.created_at, action: e.action as LimitEvent["action"], text, note: e.action === "tiers" ? null : d.note || null,
        actorName: names.get(e.actor_id) ?? "Deleted account", targetName: e.target_id ? names.get(e.target_id) ?? "Deleted account" : null,
      };
    });
    return { me: context.userId, tiers, members, history, pilotAdminOnly: PULSE_WITHDRAW_PILOT_ADMIN_ONLY, maxWaiting: PULSE_MAX_WAITING };
  });

const tierSchema = z.object({
  level: z.number().int().min(1).max(6),
  name: z.string().trim().min(1).max(40),
  perWithdrawalUsd: z.number().finite(),
  dailyUsd: z.number().finite(),
  holdHours: z.number().int(),
  minAccountDays: z.number().int().min(0),
  minWithdrawals: z.number().int().min(0),
  minWithdrawnUsd: z.number().finite().min(0),
  minTrades: z.number().int().min(0),
});

/** Replace all withdrawal levels. Checked here and again inside the database, and logged. */
export const saveWithdrawalTiers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tiers: z.array(tierSchema).min(1).max(6) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const tiers = data.tiers as WithdrawTier[];
    const why = tiersProblem(tiers);
    if (why) throw new Error(why);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = tiers.map((t) => ({
      level: t.level, name: t.name.trim(), per_withdrawal_usd: t.perWithdrawalUsd, daily_usd: t.dailyUsd, hold_hours: t.holdHours,
      min_account_days: t.minAccountDays, min_withdrawals: t.minWithdrawals, min_withdrawn_usd: t.minWithdrawnUsd, min_trades: t.minTrades,
    }));
    const { data: code, error } = await supabaseAdmin.rpc("save_withdrawal_tiers", { _actor: context.userId, _tiers: rows });
    if (error) throw new Error(error.message.replace(/^.*?ERROR:\s*/i, "") || "Couldn't save the levels.");
    if (code !== "ok") throw new Error(overrideMessage(String(code)));
    return { ok: true };
  });

/**
 * Put one member on a set level and/or pause their withdrawals (with a note), or
 * hand them back to automatic levels. The database checks the rules (caller is
 * admin, not changing their own limits) and logs it; the member is emailed.
 */
export const setWithdrawalOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    userId: z.string().uuid(),
    clear: z.boolean(),
    level: z.number().int().min(1).max(6).nullable(),
    frozen: z.boolean(),
    note: z.string().trim().max(300),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: code, error } = await supabaseAdmin.rpc("set_withdrawal_override", {
      _actor: context.userId, _target: data.userId, _tier: data.level as number, _frozen: data.frozen, _note: data.note, _clear: data.clear,
    });
    if (error) throw new Error("Couldn't save. Nothing was changed.");
    if (code !== "ok") throw new Error(overrideMessage(String(code)));
    try {
      const { limitsFor } = await import("./withdraw-limits.server");
      const { emailAccountChange } = await import("./email/send.server");
      const l = await limitsFor(data.userId);
      const lines = l.frozen
        ? ["The Seeds team paused withdrawals on your account", "Anything already waiting won't be sent while paused"]
        : [`Your withdrawal level is now ${l.tier.name}`, `Up to $${l.perWithdrawalUsd.toLocaleString("en-US")} per withdrawal and $${l.dailyUsd.toLocaleString("en-US")} a day`, `Seeds waits ${l.holdHours} hours before sending`];
      void emailAccountChange(data.userId, "Withdrawal limits", lines, "contact support@honest.money.");
    } catch (e) {
      console.error("withdrawal limit email failed", e);
    }
    return { ok: true };
  });
