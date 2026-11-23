// Server-only Ignite class reads shared by the public pages, checkout and admin desk.
import type { AgendaItem, ClassSession, IgniteClassPublic, MinerStatus } from "./ignite-classes";

export const CLASS_COLS = "id, slug, name, tagline, status, instructor_name, instructor_bio, instructor_photo_url, capacity, fee_usd, deposit_usd, miners_free, timezone, sessions, location, requirements, agenda, benefits, starts_at, ends_at, created_at, updated_at";

export type ClassRow = {
  id: string; slug: string; name: string; tagline: string | null; status: string; instructor_name: string;
  instructor_bio: string | null; instructor_photo_url: string | null; capacity: number; fee_usd: number | string;
  deposit_usd: number | string; miners_free: boolean; timezone: string; sessions: unknown; location: string;
  requirements: string | null; agenda: unknown; benefits: unknown; starts_at: string | null; ends_at: string | null;
};

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function toPublic(r: ClassRow): IgniteClassPublic {
  return {
    id: r.id, slug: r.slug, name: r.name, tagline: r.tagline, status: r.status as IgniteClassPublic["status"],
    instructorName: r.instructor_name, instructorBio: r.instructor_bio, instructorPhotoUrl: r.instructor_photo_url,
    capacity: r.capacity, feeUsd: Number(r.fee_usd), depositUsd: Number(r.deposit_usd), minersFree: r.miners_free,
    timezone: r.timezone, sessions: arr<ClassSession>(r.sessions), location: r.location, requirements: r.requirements,
    agenda: arr<AgendaItem>(r.agenda), benefits: arr<string>(r.benefits), startsAt: r.starts_at, endsAt: r.ends_at,
  };
}

/** Seats held per class right now: confirmed, or with a live/short checkout. */
export async function seatsHeldByClass(excludeUserId?: string): Promise<Map<string, number>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin.from("ignite_registrations").select("class_id")
    .or(`status.eq.confirmed,and(status.in.(pending,underpaid),invoice_expires_at.gt.${new Date().toISOString()})`);
  if (excludeUserId) q = q.neq("user_id", excludeUserId);
  const { data } = await q.limit(20000);
  const m = new Map<string, number>();
  for (const r of data ?? []) if (r.class_id) m.set(r.class_id, (m.get(r.class_id) ?? 0) + 1);
  return m;
}

export async function loadClass(by: { id?: string; slug?: string }, includeDraft = false): Promise<ClassRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin.from("ignite_classes").select(CLASS_COLS);
  if (by.id) q = q.eq("id", by.id);
  else if (by.slug) q = q.eq("slug", by.slug);
  else return null;
  const { data } = await q.maybeSingle();
  if (!data || (!includeDraft && data.status === "draft")) return null;
  return data as ClassRow;
}

/**
 * Is this member an HME miner (ever owned hash; Honest.Money's record only goes up)? An admin's mark in
 * ignite_miner_marks wins; otherwise Honest.Money's miner-status lookup.
 * "unknown" whenever it can't be checked, which charges the full class fee.
 */
export async function minerStatusFor(userId: string): Promise<{ status: MinerStatus; source: "admin" | "honest-money" | "none" }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { resolveMiner, minerFromStatus } = await import("./ignite-classes");
  const [{ data: mark }, { data: prof }] = await Promise.all([
    supabaseAdmin.from("ignite_miner_marks").select("is_miner").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("profiles").select("hm_member_id").eq("id", userId).maybeSingle(),
  ]);
  if (mark) return { status: resolveMiner(mark.is_miner, "unknown"), source: "admin" };
  const hmeId = prof?.hm_member_id;
  if (!hmeId) return { status: "unknown", source: "none" };
  try {
    if (!/^[0-9a-f-]{36}$/i.test(hmeId)) return { status: "unknown", source: "none" };
    const { signedHmeHeaders } = await import("./hme-auth.server");
    const body = JSON.stringify({ members: [hmeId] });
    const res = await fetch("https://honest.money/api/public/hme/members/mining", {
      method: "POST", headers: await signedHmeHeaders(body), redirect: "manual", body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { await noteMinerCheckFailure(`HTTP ${res.status}`); return { status: "unknown", source: "none" }; }
    if (!(res.headers.get("content-type") ?? "").includes("json")) { await noteMinerCheckFailure("not a JSON answer"); return { status: "unknown", source: "none" }; }
    const answer: unknown = await res.json();
    if (!answer || typeof answer !== "object" || (answer as { ok?: unknown }).ok !== true) {
      await noteMinerCheckFailure("answer without ok:true");
      return { status: "unknown", source: "none" };
    }
    await noteMinerCheckOk();
    return { status: minerFromStatus(hmeId, answer), source: "honest-money" };
  } catch (e) {
    const why = e instanceof Error && e.name === "TimeoutError" ? "timed out (8s)" : "couldn't reach Honest.Money";
    console.warn("[ignite] miner-status lookup failed", e instanceof Error ? e.message : e);
    await noteMinerCheckFailure(why);
    return { status: "unknown", source: "none" };
  }
}

// ---- Miner check health (auditor K1): a broken check must be noticed the same day ----

let okWrittenAt = 0;
/** Marks a proper Honest.Money answer (written at most once a minute per server). Never throws. */
async function noteMinerCheckOk(): Promise<void> {
  if (Date.now() - okWrittenAt < 60_000) return;
  okWrittenAt = Date.now();
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    await supabaseAdmin.from("miner_check_health").update({ last_ok_at: now, fails_in_a_row: 0, updated_at: now }).eq("id", "hme-mining");
  } catch { /* health notes must never block a checkout */ }
}

/**
 * Records a failed check (status code or short reason only, never the body) and, at most every
 * 5 minutes, puts one grouped entry in Admin → Bugs → Errors. Never throws.
 */
async function noteMinerCheckFailure(reason: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { shouldLogMinerFailure } = await import("./ignite-classes");
    const { data: prev } = await supabaseAdmin.from("miner_check_health").select("last_fail_at, fails_in_a_row").eq("id", "hme-mining").maybeSingle();
    const now = new Date().toISOString();
    const fails = (prev?.fails_in_a_row ?? 0) + 1;
    await supabaseAdmin.from("miner_check_health")
      .update({ last_fail_at: now, last_fail_reason: reason.slice(0, 120), fails_in_a_row: fails, updated_at: now }).eq("id", "hme-mining");
    if (!shouldLogMinerFailure(prev?.last_fail_at)) return;
    await supabaseAdmin.rpc("record_client_error", {
      _signature: "4d1e0c4ec4d1e0c4ec4d1e0c4ec4d1e0", // fixed: every miner-check failure groups under one entry
      _kind: "error",
      _message: `Server: Honest.Money's miner check failed (${reason}). Until it answers again, miners are shown the full class fee — mark miners by hand in Admin → To the Moon if needed.`,
      _source: "server:ignite-classes.minerStatusFor", _page: "", _browser: "server", _os: "", _viewport: "", _version: "", _host: "other", _account: null as unknown as string,
    });
  } catch { /* health notes must never block a checkout */ }
}

/** Admin: the miner check's last good answer and last failure. */
export async function minerCheckHealth(): Promise<{ lastOkAt: string | null; lastFailAt: string | null; lastFailReason: string | null; failsInARow: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("miner_check_health").select("last_ok_at, last_fail_at, last_fail_reason, fails_in_a_row").eq("id", "hme-mining").maybeSingle();
  return { lastOkAt: data?.last_ok_at ?? null, lastFailAt: data?.last_fail_at ?? null, lastFailReason: data?.last_fail_reason ?? null, failsInARow: data?.fails_in_a_row ?? 0 };
}

/** Adds someone to the interest list (keeps the first source; never resubscribes an unsubscribe). */
export async function addInterest(row: { email: string; fullName?: string | null; userId?: string | null; source: "unpaid_registration" | "signup" | "registration" | "admin"; registrationId?: string | null }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("ignite_interest").upsert({
    email: row.email.trim().toLowerCase(), full_name: row.fullName?.slice(0, 100) ?? null, user_id: row.userId ?? null,
    source: row.source, registration_id: row.registrationId ?? null,
  }, { onConflict: "email", ignoreDuplicates: true });
}

/** Every published class with seat counts, soonest first (counts only, no member data). */
export async function publicClasses(): Promise<(IgniteClassPublic & { seatsLeft: number; held: number })[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { classSeatsLeft } = await import("./ignite-classes");
  const [{ data }, held] = await Promise.all([
    supabaseAdmin.from("ignite_classes").select(CLASS_COLS).neq("status", "draft").order("starts_at", { ascending: true, nullsFirst: false }),
    seatsHeldByClass(),
  ]);
  return (data ?? []).map((r) => {
    const c = toPublic(r as ClassRow);
    const h = held.get(c.id) ?? 0;
    return { ...c, held: h, seatsLeft: classSeatsLeft(c.capacity, h) };
  });
}
