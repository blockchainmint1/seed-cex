/**
 * Order watch (Bobby, Nov 22 2026). Seeds holds no member coins, so a member can move
 * coins out of their pocket in HME Wallet while orders still promise them. Every minute
 * this checks members with open orders; when the pocket no longer covers everything set
 * aside for a coin, the newest orders on that coin are cancelled (ordersToCancel in
 * set-asides.ts) and the member is told by Telegram and email.
 *
 * A shortfall must show on BOTH the quick explorer read (it counts coins still waiting to
 * confirm, like the change from a send) and our own node before anything is cancelled,
 * and an unreadable balance never cancels anything.
 *
 * Audit C1: and it must still be there on a later run (coverStrike, at least 45 seconds
 * after it was first seen; order_cover_flags). A member with a fresh sighting is checked
 * again on the next run even when the rotation has moved on.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getLeg, type LegId } from "@/lib/chains";
import { COVER_FLAG_TTL_MS, coverStrike, ordersToCancel, watchTotal, type CoverOrder } from "@/lib/set-asides";

const EPS = 1e-8;
/** Members checked per run; the list rotates each minute so everyone is reached. */
const MEMBERS_PER_RUN = 30;
const PARALLEL = 5;

type OpenRow = CoverOrder & { user_id: string };

export async function checkOrderCover(): Promise<{ members: number; checked: number; cancelled: number }> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("id, user_id, pair, side, price, amount, filled, created_at")
    .in("status", ["open", "partial"])
    .not("user_id", "is", null)
    .limit(5000);
  if (error) throw new Error(error.message);
  const byUser = new Map<string, OpenRow[]>();
  for (const o of (data ?? []) as unknown as OpenRow[]) byUser.set(o.user_id, [...(byUser.get(o.user_id) ?? []), o]);
  const users = [...byUser.keys()].sort();
  const start = users.length > MEMBERS_PER_RUN ? (Math.floor(Date.now() / 60_000) * MEMBERS_PER_RUN) % users.length : 0;
  const rotation = users.length > MEMBERS_PER_RUN ? [...users, ...users].slice(start, start + MEMBERS_PER_RUN) : users;
  // Members with a recent shortfall sighting get their second look on this run.
  const { data: flags } = await supabaseAdmin.from("order_cover_flags").select("user_id, leg, first_seen_at");
  const flagged = new Map<string, Map<string, number>>();
  for (const f of flags ?? []) {
    if (!byUser.has(f.user_id)) continue;
    const m = flagged.get(f.user_id) ?? new Map<string, number>();
    m.set(f.leg, Date.parse(f.first_seen_at));
    flagged.set(f.user_id, m);
  }
  // Sightings for members with no open orders left are done with.
  const done = (flags ?? []).filter((f) => !byUser.has(f.user_id)).map((f) => f.user_id);
  if (done.length) await supabaseAdmin.from("order_cover_flags").delete().in("user_id", [...new Set(done)]);
  const batch = [...new Set([...flagged.keys(), ...rotation])];

  let cancelled = 0;
  for (let i = 0; i < batch.length; i += PARALLEL) {
    const counts = await Promise.all(batch.slice(i, i + PARALLEL).map((u) => checkMember(u, byUser.get(u) ?? [], flagged.get(u) ?? new Map()).catch((e) => {
      console.error("order cover check failed", e instanceof Error ? e.message : e);
      return 0;
    })));
    cancelled += counts.reduce((s, n) => s + n, 0);
  }
  return { members: users.length, checked: batch.length, cancelled };
}

async function clearFlag(userId: string, leg: string, seen: Map<string, number>) {
  if (!seen.has(leg)) return;
  await supabaseAdmin.from("order_cover_flags").delete().eq("user_id", userId).eq("leg", leg);
}

async function checkMember(userId: string, orders: OpenRow[], seen: Map<string, number>): Promise<number> {
  const { loadSetAsides } = await import("@/lib/set-asides.server");
  const { pocketSender, pocketLegBalance } = await import("@/lib/pocket-send/pocket.server");
  const held = await loadSetAsides(userId);
  let total = 0;
  for (const leg of seen.keys()) if (!held[leg as LegId] || held[leg as LegId]!.orders <= EPS) await clearFlag(userId, leg, seen);
  for (const [leg, s] of Object.entries(held) as Array<[LegId, NonNullable<(typeof held)[LegId]>]>) {
    if (s.orders <= EPS) continue;
    // Sends Seeds is about to make (withdrawals, swaps waiting for a tap) don't count here:
    // orders were placed against what's left after them (audit C3).
    const need = watchTotal(s);
    // A pocket that can't send at all is handled when a match happens (order-readiness.ts).
    const sender = await pocketSender(userId, leg, "trade");
    if (!sender.ok) continue;
    const quick = await pocketLegBalance(sender.address, leg, need, { balanceOnly: true, display: true });
    if (quick.balance == null) continue;
    if (quick.balance + EPS >= need) { await clearFlag(userId, leg, seen); continue; }
    const node = await pocketLegBalance(sender.address, leg, need, { balanceOnly: true });
    if (node.balance == null) continue;
    if (node.balance + EPS >= need) { await clearFlag(userId, leg, seen); continue; }
    // Audit C1: first sighting → remember it and look again next run. Nothing is cancelled.
    const firstSeen = seen.get(leg) ?? null;
    if (coverStrike(firstSeen, Date.now()) === "flag") {
      // Keep a recent sighting as it is (a quick second run mustn't push it forward).
      if (firstSeen == null || Date.now() - firstSeen > COVER_FLAG_TTL_MS) {
        await supabaseAdmin.from("order_cover_flags").upsert({ user_id: userId, leg, first_seen_at: new Date().toISOString() }, { onConflict: "user_id,leg" });
      }
      continue;
    }
    await clearFlag(userId, leg, seen);
    const balance = Math.max(quick.balance, node.balance);
    const ids = ordersToCancel({ leg, balance, fixed: s.trades + s.p2p, orders });
    const gone: OpenRow[] = [];
    for (const id of ids) {
      const o = orders.find((x) => x.id === id)!;
      // Compare-and-set: an order that filled meanwhile is left alone (next run re-checks).
      const { data } = await supabaseAdmin.from("orders")
        .update({ status: "cancelled", cancel_reason: "coins_left_pocket" })
        .eq("id", id).eq("user_id", userId).eq("filled", Number(o.filled)).in("status", ["open", "partial"]).select("id");
      if (data?.length) gone.push(o);
    }
    if (gone.length) {
      total += gone.length;
      await tell(userId, leg, gone.length, balance, need);
    }
  }
  return total;
}

async function tell(userId: string, leg: LegId, n: number, balance: number, needed: number) {
  const sym = getLeg(leg).symbol;
  const f = (x: number) => Number(x.toFixed(8)).toLocaleString("en-US", { maximumFractionDigits: 8 });
  const what = `${n} ${sym} order${n === 1 ? "" : "s"}`;
  const line = `Your trading pocket now holds ${f(balance)} ${sym}, but your open orders and trades needed ${f(needed)} ${sym}. Coins left the pocket outside Seeds, so Seeds cancelled the newest ${what} it could no longer cover. Nothing was sent.`;
  try {
    const { notifyUser } = await import("@/lib/telegram.server");
    const { emailAccountChange } = await import("@/lib/email/send.server");
    await Promise.allSettled([
      notifyUser(userId, "notify_settlement_failed", `⚠ Seeds cancelled ${what}\n${line}\nSee them on https://seeds.honest.money/activity`),
      emailAccountChange(userId, "Orders cancelled", [line, "Orders it can still cover stay open. See everything on your Activity page."],
        "revoke Seeds' access in HME Wallet right away, then contact support@honest.money."),
    ]);
  } catch (e) {
    console.error("order cover alert failed", e instanceof Error ? e.message : e);
  }
}
