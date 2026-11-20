/**
 * Stand-in daily closes from Seeds' own 5-minute market record (server-only).
 * Rules (which day, which record) live in price-catchup.ts (tested).
 */
import { closeFromSnapshots, dayToFill, SNAPSHOT_MATCH_WINDOW_MIN, type SnapshotRow } from "./price-catchup";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

/** For each coin still missing yesterday's close, store the price Seeds recorded at midnight. Returns how many were filled. */
export async function fillClosesFromSnapshots(db: Admin, nowMs = Date.now()): Promise<number> {
  const { data: coins } = await db.from("ai_coins").select("id, swap_coin").eq("active", true);
  let filled = 0;
  for (const c of coins ?? []) {
    const base = c.swap_coin;
    if (!base || base.includes(":")) continue; // Seeds-only markets (HEX/PLS) aren't in the 5-minute record
    const { data: last } = await db.from("ai_daily_prices").select("day").eq("coin_id", c.id).order("day", { ascending: false }).limit(1).maybeSingle();
    const day = dayToFill(last?.day ?? null, nowMs);
    if (!day) continue;
    const midnight = Date.parse(`${day}T00:00:00Z`) + 86_400_000;
    const w = SNAPSHOT_MATCH_WINDOW_MIN * 60_000;
    const { data: rows } = await db.from("market_snapshots_5min")
      .select("bucket, price, asset_tor_price, live")
      .eq("base", base.toUpperCase())
      .gte("bucket", new Date(midnight - w).toISOString())
      .lte("bucket", new Date(midnight + w).toISOString());
    const close = closeFromSnapshots((rows ?? []) as SnapshotRow[], day);
    if (close == null) continue;
    const { error } = await db.from("ai_daily_prices").upsert({ coin_id: c.id, day, close, source: "seeds" }, { onConflict: "coin_id,day", ignoreDuplicates: true });
    if (!error) filled++;
  }
  return filled;
}
