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
 * Is this member an HME miner (any live hash power)? An admin's mark in
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
    const { ecosystemHeaders } = await import("./hme-auth.server");
    const res = await fetch("https://honest.money/api/public/minetxc/miner-status", {
      method: "POST", headers: ecosystemHeaders(), redirect: "manual",
      body: JSON.stringify({ members: [{ ref: "seeds-ignite", hmeId }] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return { status: "unknown", source: "none" };
    return { status: minerFromStatus(hmeId, await res.json()), source: "honest-money" };
  } catch (e) {
    console.warn("[ignite] miner-status lookup failed", e instanceof Error ? e.message : e);
    return { status: "unknown", source: "none" };
  }
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
