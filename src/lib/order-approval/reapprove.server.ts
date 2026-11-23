/**
 * Orders placed before one-tap order approval (Bobby, Nov 23 2026: "Cancel them … no old-style
 * taps ever again"). Every minute (jobs/send-approvals) any open order with no placement tap
 * is cancelled with cancel_reason "reapprove_needed" and its owner gets one Telegram note per
 * run listing what to re-place. Compare-and-set on status + filled, so an order that is
 * filling right now is left for the next run.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getLeg, getPair } from "@/lib/chains";
import { ordersNeedingReapproval, reapprovalNote, type ReapproveLine } from "./rules";

type BookRow = { id: string; user_id: string | null; pair: string; side: "buy" | "sell"; price: number; amount: number; filled: number };

export async function retireUntappedOrders(): Promise<{ cancelled: number; members: number }> {
  const { data, error } = await supabaseAdmin.from("orders")
    .select("id, user_id, pair, side, price, amount, filled")
    .in("status", ["open", "partial"]).not("user_id", "is", null).limit(2000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as BookRow[];
  if (!rows.length) return { cancelled: 0, members: 0 };

  // An order placed with a tap has a purpose-"order" approval whose ref_id is the order id.
  const approved = new Set<string>();
  for (let i = 0; i < rows.length; i += 200) {
    const ids = rows.slice(i, i + 200).map((r) => r.id);
    const { data: taps, error: tapErr } = await supabaseAdmin.from("send_approvals").select("ref_id").eq("purpose", "order").in("ref_id", ids);
    // Unreadable approvals → cancel nothing this run.
    if (tapErr) throw new Error(tapErr.message);
    for (const t of taps ?? []) if (t.ref_id) approved.add(t.ref_id);
  }
  const pick = new Set(ordersNeedingReapproval(rows.map((r) => ({ id: r.id, userId: r.user_id })), approved));

  const byUser = new Map<string, ReapproveLine[]>();
  for (const r of rows) {
    if (!pick.has(r.id) || !r.user_id) continue;
    const { data: gone } = await supabaseAdmin.from("orders")
      .update({ status: "cancelled", cancel_reason: "reapprove_needed" })
      .eq("id", r.id).eq("user_id", r.user_id).eq("filled", Number(r.filled)).in("status", ["open", "partial"]).select("id");
    if (!gone?.length) continue;
    const pair = getPair(r.pair);
    byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), {
      side: r.side, amount: Number(r.amount), filled: Number(r.filled), price: Number(r.price),
      baseSymbol: getLeg(pair.baseLeg).symbol, quoteSymbol: getLeg(pair.quoteLeg).symbol,
    }]);
  }

  const { notifyUser } = await import("@/lib/telegram.server");
  let cancelled = 0;
  for (const [userId, lines] of byUser) {
    cancelled += lines.length;
    await notifyUser(userId, "notify_settlement_failed", reapprovalNote(lines)).catch((e) =>
      console.error("re-place note failed", e instanceof Error ? e.message : e));
  }
  return { cancelled, members: byUser.size };
}
