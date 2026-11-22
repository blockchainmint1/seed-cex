/**
 * Audit 2026-11-22 R2: repeated failed matches on the member's own side pause placing
 * orders (rules in order-readiness.ts). Counted from cancelled_preflight trade events
 * that name the member as culprit; an admin's clear (profiles.order_pause_cleared_at)
 * resets the count.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { REPEAT_FAILURE_WINDOW_MS, repeatFailurePause } from "@/lib/order-readiness";

export type OrderPause = { paused: boolean; count: number; untilMs: number | null; lastTradeId: string | null };

/** Every member's failure times in the last 24 hours (admin overview). */
export async function recentFailuresByMember(): Promise<Map<string, { at: number[]; lastTradeId: string }>> {
  const since = new Date(Date.now() - REPEAT_FAILURE_WINDOW_MS).toISOString();
  const { data } = await supabaseAdmin.from("trade_events").select("trade_id, created_at, detail")
    .eq("event", "cancelled_preflight").gte("created_at", since).order("created_at", { ascending: true }).limit(5000);
  const out = new Map<string, { at: number[]; lastTradeId: string }>();
  for (const r of data ?? []) {
    const who = (r.detail as { culprit?: unknown } | null)?.culprit;
    if (typeof who !== "string" || !who) continue;
    const cur = out.get(who) ?? { at: [], lastTradeId: r.trade_id };
    cur.at.push(Date.parse(r.created_at));
    cur.lastTradeId = r.trade_id;
    out.set(who, cur);
  }
  return out;
}

export async function orderPauseFor(userId: string): Promise<OrderPause> {
  const since = new Date(Date.now() - REPEAT_FAILURE_WINDOW_MS).toISOString();
  const [{ data: rows }, { data: prof }] = await Promise.all([
    supabaseAdmin.from("trade_events").select("trade_id, created_at")
      .eq("event", "cancelled_preflight").eq("detail->>culprit", userId).gte("created_at", since)
      .order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("profiles").select("order_pause_cleared_at").eq("id", userId).maybeSingle(),
  ]);
  const cleared = prof?.order_pause_cleared_at ? Date.parse(prof.order_pause_cleared_at) : null;
  const r = repeatFailurePause({ failedAtMs: (rows ?? []).map((x) => Date.parse(x.created_at)), clearedAtMs: cleared, nowMs: Date.now() });
  return { ...r, lastTradeId: rows?.[0]?.trade_id ?? null };
}
