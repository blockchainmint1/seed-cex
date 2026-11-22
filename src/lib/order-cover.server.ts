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
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getLeg, type LegId } from "@/lib/chains";
import { ordersToCancel, type CoverOrder } from "@/lib/set-asides";

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
  const batch = users.length > MEMBERS_PER_RUN ? [...users, ...users].slice(start, start + MEMBERS_PER_RUN) : users;

  let cancelled = 0;
  for (let i = 0; i < batch.length; i += PARALLEL) {
    const counts = await Promise.all(batch.slice(i, i + PARALLEL).map((u) => checkMember(u, byUser.get(u) ?? []).catch((e) => {
      console.error("order cover check failed", e instanceof Error ? e.message : e);
      return 0;
    })));
    cancelled += counts.reduce((s, n) => s + n, 0);
  }
  return { members: users.length, checked: batch.length, cancelled };
}

async function checkMember(userId: string, orders: OpenRow[]): Promise<number> {
  const { loadSetAsides } = await import("@/lib/set-asides.server");
  const { pocketSender, pocketLegBalance } = await import("@/lib/pocket-send/pocket.server");
  const held = await loadSetAsides(userId);
  let total = 0;
  for (const [leg, s] of Object.entries(held) as Array<[LegId, NonNullable<(typeof held)[LegId]>]>) {
    if (s.orders <= EPS) continue;
    // A pocket that can't send at all is handled when a match happens (order-readiness.ts).
    const sender = await pocketSender(userId, leg, "trade");
    if (!sender.ok) continue;
    const quick = await pocketLegBalance(sender.address, leg, s.total, { balanceOnly: true, display: true });
    if (quick.balance == null || quick.balance + EPS >= s.total) continue;
    const node = await pocketLegBalance(sender.address, leg, s.total, { balanceOnly: true });
    if (node.balance == null || node.balance + EPS >= s.total) continue;
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
      await tell(userId, leg, gone.length, balance, s.total);
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
