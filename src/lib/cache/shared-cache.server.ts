/**
 * Seeds' shared display cache: one recent copy of display data for every visitor.
 *
 *   1. this server instance's own memory (a few seconds, finished values only —
 *      Workers forbids awaiting another request's promise),
 *   2. the shared_cache row every instance reads (server role only),
 *   3. the live lookup — done by ONE caller per key at a time (shared_cache_claim);
 *      everyone else keeps seeing the previous copy meanwhile.
 *
 * A failed or "offline" live answer never replaces a good copy. Any cache error
 * falls through to the live lookup, so the cache can slow nothing down or break nothing.
 * Never use this for sends, settlement, reservations or limits: those read live.
 */
import { forceAllowed, leaseMs, memoryMs, planRead, type CacheTimes } from "./shared-cache-rules";

type Mem = { at: number; refreshedAt: number; value: unknown };
const memory = new Map<string, Mem>();
const MEMORY_MAX = 5_000;

function remember(key: string, refreshedAt: number, value: unknown) {
  if (memory.size >= MEMORY_MAX) memory.clear();
  memory.set(key, { at: Date.now(), refreshedAt, value });
}

async function admin() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin;
  } catch {
    return null;
  }
}

export type SharedOptions<T> = CacheTimes & {
  /** Only answers that pass are stored (e.g. `online: true`). Default: every answer. */
  good?: (value: T) => boolean;
  /** Member pressed Refresh: skip copies older than 10 seconds. */
  force?: boolean;
};

export async function shared<T>(key: string, opts: SharedOptions<T>, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const good = opts.good ?? (() => true);
  const mem = memory.get(key);
  if (mem && now - mem.at <= memoryMs(opts.freshMs) && !(opts.force && forceAllowed(now, mem.refreshedAt))) {
    return mem.value as T;
  }

  const db = await admin();
  let row: { value: unknown; refreshed_at: string } | null = null;
  if (db) {
    try {
      const { data } = await db.from("shared_cache").select("value, refreshed_at").eq("key", key).maybeSingle();
      row = data ?? null;
    } catch {
      row = null;
    }
  }
  const rowAt = row ? Date.parse(row.refreshed_at) : null;
  let plan = planRead(now, rowAt, opts);
  if (opts.force && plan === "fresh" && forceAllowed(now, rowAt)) plan = "load";

  if (plan === "fresh") {
    remember(key, rowAt!, row!.value);
    return row!.value as T;
  }

  if (plan === "refresh" && db) {
    let claimed = false;
    try {
      const { data } = await db.rpc("shared_cache_claim", { _key: key, _fresh_ms: opts.freshMs, _lease_ms: leaseMs(opts.freshMs) });
      claimed = data === true;
    } catch {
      claimed = false;
    }
    if (!claimed) {
      remember(key, rowAt!, row!.value);
      return row!.value as T;
    }
  }

  const showable = plan === "refresh" && row ? row : null;
  let value: T;
  try {
    value = await load();
  } catch (e) {
    if (showable) return showable.value as T;
    throw e;
  }
  if (!good(value)) {
    // A failed lookup never replaces a good copy that is still showable.
    return showable ? (showable.value as T) : value;
  }
  const at = Date.now();
  remember(key, at, value);
  if (db) {
    try {
      await db.from("shared_cache").upsert({ key, value: value as never, refreshed_at: new Date(at).toISOString(), lease_until: null });
    } catch {
      /* the next reader refreshes it */
    }
  }
  return value;
}
