import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "./admin-guard";
import type { AgendaItem, ClassInput, ClassSession } from "./ignite-classes";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHOTO_PREFIX = "https://seeds.honest.money/api/public/ignite-photo/";

/** Admin: every class, drafts included, with seats taken. */
export const getAdminIgniteClasses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { CLASS_COLS, toPublic, seatsHeldByClass } = await import("./ignite-classes.server");
    const [{ data }, held, { data: paid }] = await Promise.all([
      supabaseAdmin.from("ignite_classes").select(CLASS_COLS).order("starts_at", { ascending: true, nullsFirst: false }),
      seatsHeldByClass(),
      supabaseAdmin.from("ignite_registrations").select("class_id").eq("status", "confirmed").limit(20000),
    ]);
    const paidBy = new Map<string, number>();
    for (const r of paid ?? []) if (r.class_id) paidBy.set(r.class_id, (paidBy.get(r.class_id) ?? 0) + 1);
    return (data ?? []).map((r) => ({ ...toPublic(r as never), held: held.get(r.id) ?? 0, confirmed: paidBy.get(r.id) ?? 0 }));
  });

function cleanInput(d: ClassInput): ClassInput {
  const str = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  const sessions: ClassSession[] = (Array.isArray(d?.sessions) ? d.sessions : []).slice(0, 25).map((s) => ({
    starts_at: new Date(String(s?.starts_at ?? "")).toISOString?.() ?? "", ends_at: new Date(String(s?.ends_at ?? "")).toISOString?.() ?? "",
  }));
  return {
    slug: str(d?.slug, 60).trim().toLowerCase(), name: str(d?.name, 60).trim(), tagline: str(d?.tagline, 200).trim(), status: str(d?.status, 10),
    instructorName: str(d?.instructorName, 80).trim(), instructorBio: str(d?.instructorBio, 600).trim(), instructorPhotoUrl: str(d?.instructorPhotoUrl, 300).trim(),
    capacity: Number(d?.capacity), feeUsd: Number(d?.feeUsd), depositUsd: Number(d?.depositUsd), minersFree: !!d?.minersFree,
    timezone: str(d?.timezone, 40), sessions, location: str(d?.location, 120).trim(), requirements: str(d?.requirements, 2000).trim(),
    agenda: (Array.isArray(d?.agenda) ? d.agenda : []).slice(0, 25).map((a: AgendaItem) => ({ title: str(a?.title, 100).trim(), detail: str(a?.detail, 320).trim() })),
    benefits: (Array.isArray(d?.benefits) ? d.benefits : []).slice(0, 15).map((b) => str(b, 140).trim()).filter(Boolean),
  };
}

/** Admin: create or update a class. Seats can't drop below seats already held. */
export const saveIgniteClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string | null; input: ClassInput }) => {
    if (d?.id && !UUID_RE.test(d.id)) throw new Error("Bad class id");
    let input: ClassInput;
    try { input = cleanInput(d?.input); } catch { throw new Error("Check the session times."); }
    return { id: d?.id ?? null, input };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { validateClass, classSpan } = await import("./ignite-classes");
    const { seatsHeldByClass } = await import("./ignite-classes.server");
    const held = data.id ? (await seatsHeldByClass()).get(data.id) ?? 0 : 0;
    const errors = validateClass(data.input, { held });
    if (data.input.instructorPhotoUrl && !data.input.instructorPhotoUrl.startsWith(PHOTO_PREFIX)) errors.instructorPhotoUrl = "Upload the photo here instead of pasting a link.";
    if (Object.keys(errors).length) return { ok: false as const, errors };
    const sessions = [...data.input.sessions].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const span = classSpan(sessions);
    const row = {
      slug: data.input.slug, name: data.input.name, tagline: data.input.tagline || null, status: data.input.status,
      instructor_name: data.input.instructorName, instructor_bio: data.input.instructorBio || null, instructor_photo_url: data.input.instructorPhotoUrl || null,
      capacity: data.input.capacity, fee_usd: data.input.feeUsd, deposit_usd: data.input.depositUsd, miners_free: data.input.minersFree,
      timezone: data.input.timezone, sessions, location: data.input.location || "Live online", requirements: data.input.requirements || null,
      agenda: data.input.agenda, benefits: data.input.benefits, starts_at: span.startsAt, ends_at: span.endsAt, updated_at: new Date().toISOString(),
    };
    const q = data.id
      ? supabaseAdmin.from("ignite_classes").update(row).eq("id", data.id).select("id, slug").single()
      : supabaseAdmin.from("ignite_classes").insert(row).select("id, slug").single();
    const { data: saved, error } = await q;
    if (error) {
      if (error.code === "23505") return { ok: false as const, errors: { slug: "Another class already uses that address." } };
      console.error("[ignite] class save failed", error.message);
      throw new Error("Couldn't save the class.");
    }
    console.info("[ignite] class saved", { id: saved.id, by: context.userId, status: row.status });
    return { ok: true as const, id: saved.id, slug: saved.slug };
  });

/** Admin: upload an instructor photo (JPEG/PNG/WebP, up to 3 MB). Returns the address to save on the class. */
export const uploadIgnitePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { dataUrl: string }) => {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(d?.dataUrl ?? ""));
    if (!m) throw new Error("Use a JPEG, PNG or WebP photo.");
    if (m[2]!.length > 4_200_000) throw new Error("Photo must be under 3 MB.");
    return { type: m[1]!, b64: m[2]! };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bytes = Uint8Array.from(atob(data.b64), (c) => c.charCodeAt(0));
    const id = crypto.randomUUID();
    const { error } = await supabaseAdmin.storage.from("ignite-media").upload(`instructors/${id}`, bytes, { contentType: data.type, upsert: false });
    if (error) { console.error("[ignite] photo upload failed", error.message); throw new Error("Couldn't upload the photo."); }
    return { url: `${PHOTO_PREFIX}${id}` };
  });

/** Admin: mark a member as an HME miner (class fee waived) or not, or clear the mark (null) to use the automatic check. */
export const setIgniteMinerMark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; isMiner: boolean | null; note?: string }) => {
    if (!UUID_RE.test(d?.userId ?? "")) throw new Error("Bad member id");
    return { userId: d.userId, isMiner: d.isMiner === null ? null : !!d.isMiner, note: String(d?.note ?? "").slice(0, 200) || null };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = data.isMiner === null
      ? await supabaseAdmin.from("ignite_miner_marks").delete().eq("user_id", data.userId)
      : await supabaseAdmin.from("ignite_miner_marks").upsert({ user_id: data.userId, is_miner: data.isMiner, note: data.note, set_by: context.userId, set_at: new Date().toISOString() });
    if (error) throw new Error("Couldn't save the miner mark.");
    console.info("[ignite] miner mark", { user: data.userId, isMiner: data.isMiner, by: context.userId });
    return { ok: true };
  });

/** Admin: the miner check for one member right now (admin mark or Honest.Money). */
export const checkIgniteMiner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => {
    if (!UUID_RE.test(d?.userId ?? "")) throw new Error("Bad member id");
    return { userId: d.userId };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { minerStatusFor } = await import("./ignite-classes.server");
    return minerStatusFor(data.userId);
  });

// ---- Interest list ----

/** Public: "tell me about new classes". Stores the email only; IP-capped; no email is sent. */
export const joinIgniteInterest = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; name?: string }) => {
    const email = String(d?.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 255) throw new Error("Enter a valid email address.");
    return { email, name: String(d?.name ?? "").trim().slice(0, 100) || null };
  })
  .handler(async ({ data }) => {
    const { requireIpAllowance } = await import("./ip-rate.server");
    const { IP_LIMITS } = await import("./ip-rate");
    await requireIpAllowance("ignite-interest", IP_LIMITS.igniteInterest);
    const { addInterest } = await import("./ignite-classes.server");
    await addInterest({ email: data.email, fullName: data.name, source: "signup" });
    return { ok: true };
  });

export type InterestRow = { id: string; email: string; fullName: string | null; source: string; createdAt: string; unsubscribedAt: string | null; lastEmailedAt: string | null; hasSeat: boolean; seatClass: string | null };

/** Admin: the interest list, with who already has a paid seat. */
export const getIgniteInterest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InterestRow[]> => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: rows }, { data: seats }, { data: classes }] = await Promise.all([
      supabaseAdmin.from("ignite_interest").select("id, email, full_name, source, created_at, unsubscribed_at, last_emailed_at").order("created_at", { ascending: false }).limit(10000),
      supabaseAdmin.from("ignite_registrations").select("email, class_id").eq("status", "confirmed").limit(20000),
      supabaseAdmin.from("ignite_classes").select("id, name"),
    ]);
    const cname = new Map((classes ?? []).map((c) => [c.id, c.name]));
    const seat = new Map((seats ?? []).map((s) => [s.email.toLowerCase(), s.class_id ? cname.get(s.class_id) ?? "a class" : "a class"]));
    return (rows ?? []).map((r) => ({
      id: r.id, email: r.email, fullName: r.full_name, source: r.source, createdAt: r.created_at, unsubscribedAt: r.unsubscribed_at,
      lastEmailedAt: r.last_emailed_at, hasSeat: seat.has(r.email), seatClass: seat.get(r.email) ?? null,
    }));
  });

/** Admin: email chosen interest-list people (unsubscribed people are always skipped). */
export const sendIgniteInterestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[]; subject: string; body: string; classSlug?: string | null }) => {
    const ids = Array.isArray(d?.ids) ? [...new Set(d.ids.map(String))] : [];
    if (!ids.length) throw new Error("Pick at least one person.");
    if (ids.length > 200) throw new Error("At most 200 people per send.");
    if (!ids.every((x) => UUID_RE.test(x))) throw new Error("Bad id");
    const slug = d?.classSlug ? String(d.classSlug).slice(0, 40) : null;
    return { ids, subject: String(d?.subject ?? ""), body: String(d?.body ?? ""), classSlug: slug };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { validateMessage, personalize, paragraphs } = await import("./ignite-admin");
    const problems = validateMessage(data);
    if (problems.subject || problems.body) throw new Error(problems.subject ?? problems.body);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sesConfigured } = await import("./email/ses.server");
    if (!sesConfigured()) throw new Error("Email isn't set up right now.");
    const secret = process.env.EMAIL_LINK_SECRET;
    if (!secret) throw new Error("Unsubscribe links aren't set up.");
    const { makeUnsubToken } = await import("./email/links");
    const { deliver } = await import("./email/send.server");
    const { SLUG_RE } = await import("./ignite-classes");
    const ctaSlug = data.classSlug && SLUG_RE.test(data.classSlug) ? data.classSlug : null;
    const { data: rows } = await supabaseAdmin.from("ignite_interest").select("id, email, full_name, unsubscribed_at").in("id", data.ids);
    const out = { sent: [] as string[], skipped: [] as { name: string; reason: string }[], failed: [] as string[] };
    const list = rows ?? [];
    for (let i = 0; i < list.length; i += 8) {
      await Promise.all(list.slice(i, i + 8).map(async (r) => {
        const who = r.full_name || r.email;
        if (r.unsubscribed_at) { out.skipped.push({ name: who, reason: "unsubscribed" }); return; }
        const name = r.full_name || "there";
        try {
          await deliver(r.email, "ignite-interest", {
            subject: personalize(data.subject.trim(), name).slice(0, 160), paragraphs: paragraphs(personalize(data.body, name)),
            classSlug: ctaSlug, unsubscribeUrl: `https://seeds.honest.money/api/public/email/unsubscribe?t=${encodeURIComponent(makeUnsubToken(secret, "ignite", r.id))}`,
          });
          out.sent.push(who);
          await supabaseAdmin.from("ignite_interest").update({ last_emailed_at: new Date().toISOString() }).eq("id", r.id);
        } catch (e) {
          console.error("[ignite] interest email failed", r.id, e instanceof Error ? e.message : e);
          out.failed.push(who);
        }
      }));
    }
    console.info("[ignite] interest message", { by: context.userId, sent: out.sent.length, skipped: out.skipped.length, failed: out.failed.length });
    return out;
  });

/** Admin: add people to the interest list by hand (one email per line, optional "Name <email>"). */
export const addIgniteInterest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { text: string }) => ({ text: String(d?.text ?? "").slice(0, 50_000) }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { addInterest } = await import("./ignite-classes.server");
    let added = 0; const bad: string[] = [];
    for (const line of data.text.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean).slice(0, 2000)) {
      const m = /^(.*?)<([^>]+)>$/.exec(line);
      const email = (m ? m[2]! : line).trim().toLowerCase();
      const name = m ? m[1]!.trim().replace(/^"|"$/g, "") : null;
      if (!EMAIL_RE.test(email) || email.length > 255) { bad.push(line.slice(0, 60)); continue; }
      await addInterest({ email, fullName: name, source: "admin" });
      added++;
    }
    return { added, bad };
  });
