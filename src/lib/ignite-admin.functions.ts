import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanIds(v: unknown, max: number): string[] {
  const ids = Array.isArray(v) ? [...new Set(v.map(String))] : [];
  if (!ids.length) throw new Error("Pick at least one registrant.");
  if (ids.length > max) throw new Error(`At most ${max} people per send.`);
  if (!ids.every((id) => UUID_RE.test(id))) throw new Error("Bad registration id");
  return ids;
}

type SendResult = { sent: string[]; skipped: { name: string; reason: string }[]; failed: string[] };

async function inChunks<T>(items: T[], size: number, fn: (t: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

/**
 * Emails a "finish your registration" link to unpaid registrants. The link goes
 * to /ignite, which opens a fresh NectarPay checkout for the amount Seeds sets
 * — old checkout links expire after an hour, so they're never resent.
 */
export const sendIgniteReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[] }) => ({ ids: cleanIds(d?.ids, 150) }))
  .handler(async ({ data, context }): Promise<SendResult> => {
    const { data: mine } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!mine) throw new Error("Forbidden: admin role required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sesConfigured } = await import("./email/ses.server");
    if (!sesConfigured()) throw new Error("Email isn't set up right now.");
    const { reminderBlock } = await import("./ignite-admin");
    const { DEPOSIT_USD, SCHEDULE_DATES, SCHEDULE_TIME, SEAT_CAPACITY, seatsLeft } = await import("./ignite-registration");
    const { deliver } = await import("./email/send.server");

    const [{ data: regs }, { data: logs }, { count: held }] = await Promise.all([
      supabaseAdmin.from("ignite_registrations").select("id, full_name, email, status").in("id", data.ids),
      supabaseAdmin.from("ignite_admin_emails").select("registration_id, sent_at").eq("kind", "reminder").eq("status", "sent").in("registration_id", data.ids).order("sent_at", { ascending: false }),
      supabaseAdmin.from("ignite_registrations").select("id", { count: "exact", head: true })
        .or(`status.eq.confirmed,and(status.in.(pending,underpaid),invoice_expires_at.gt.${new Date().toISOString()})`),
    ]);
    const last = new Map<string, string>();
    for (const l of logs ?? []) if (!last.has(l.registration_id)) last.set(l.registration_id, l.sent_at);
    const left = seatsLeft(held ?? 0, SEAT_CAPACITY);
    const out: SendResult = { sent: [], skipped: [], failed: [] };
    if (left === 0) {
      for (const r of regs ?? []) out.skipped.push({ name: r.full_name, reason: "The class is full." });
      return out;
    }
    await inChunks(regs ?? [], 8, async (r) => {
      const block = reminderBlock(r.status, last.get(r.id) ?? null);
      if (block) { out.skipped.push({ name: r.full_name, reason: block }); return; }
      const first = r.full_name.trim().split(/\s+/)[0] || "there";
      let status: "sent" | "failed" = "sent";
      try {
        await deliver(r.email, "ignite-reminder", { name: first, amount: DEPOSIT_USD, dates: SCHEDULE_DATES, time: SCHEDULE_TIME, seatsLeft: left });
        out.sent.push(r.full_name);
      } catch (e) {
        console.error("[ignite-admin] reminder failed", r.id, e);
        status = "failed";
        out.failed.push(r.full_name);
      }
      await supabaseAdmin.from("ignite_admin_emails").insert({ registration_id: r.id, kind: "reminder", subject: "Finish reserving your Ignite seat", to_email: r.email, sent_by: context.userId, status });
    });
    console.info("[ignite-admin] reminders", { by: context.userId, sent: out.sent.length, skipped: out.skipped.length, failed: out.failed.length });
    return out;
  });

/** Sends an admin-written message to chosen registrants at their registration email. `{first}` becomes each first name. */
export const sendIgniteMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[]; subject: string; body: string }) => ({
    ids: cleanIds(d?.ids, 150), subject: String(d?.subject ?? ""), body: String(d?.body ?? ""),
  }))
  .handler(async ({ data, context }): Promise<SendResult> => {
    const { data: mine } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!mine) throw new Error("Forbidden: admin role required");
    const { validateMessage, personalize, paragraphs } = await import("./ignite-admin");
    const problems = validateMessage(data);
    if (problems.subject || problems.body) throw new Error(problems.subject ?? problems.body);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sesConfigured } = await import("./email/ses.server");
    if (!sesConfigured()) throw new Error("Email isn't set up right now.");
    const { deliver } = await import("./email/send.server");
    const { data: regs } = await supabaseAdmin.from("ignite_registrations").select("id, full_name, email").in("id", data.ids);
    const out: SendResult = { sent: [], skipped: [], failed: [] };
    await inChunks(regs ?? [], 8, async (r) => {
      const subject = personalize(data.subject.trim(), r.full_name).slice(0, 160);
      let status: "sent" | "failed" = "sent";
      try {
        await deliver(r.email, "ignite-message", { subject, paragraphs: paragraphs(personalize(data.body, r.full_name)) });
        out.sent.push(r.full_name);
      } catch (e) {
        console.error("[ignite-admin] message failed", r.id, e);
        status = "failed";
        out.failed.push(r.full_name);
      }
      await supabaseAdmin.from("ignite_admin_emails").insert({ registration_id: r.id, kind: "message", subject, to_email: r.email, sent_by: context.userId, status });
    });
    console.info("[ignite-admin] message", { by: context.userId, sent: out.sent.length, failed: out.failed.length });
    return out;
  });
