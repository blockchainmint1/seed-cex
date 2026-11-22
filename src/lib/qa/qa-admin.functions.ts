/** Admin side of the QA Center: every function requires the admin role plus a fresh admin code. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/admin-guard";
import { QA_LIMITS, cleanText, duplicateProblem, isSeverity, isStatus, parseRef } from "./qa-rules";

export type AdminQaRow = {
  id: string; ref_no: number; category: string; title: string; status: string; severity: string | null;
  assignee_id: string | null; assignee: string; reporter_id: string; reporter: string;
  duplicate_of: string | null; duplicate_of_ref: number | null; duplicates: number;
  page_path: string; browser: string; os: string; viewport: string; app_version: string;
  description: string; expected: string; actual: string; steps: string;
  files: number; comments: number; created_at: string; updated_at: string;
};

export const adminListQaReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { namesFor, qaSettings, qaTelegramGroup } = await import("./qa.server");
    const [{ data: reports }, { data: files }, { data: comments }, settings, { data: adminRoles }] = await Promise.all([
      supabaseAdmin.from("qa_reports").select("*").order("created_at", { ascending: false }).limit(2000),
      supabaseAdmin.from("qa_attachments").select("report_id").eq("uploaded", true).limit(10000),
      supabaseAdmin.from("qa_comments").select("report_id").limit(20000),
      qaSettings(),
      supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin"),
    ]);
    const list = reports ?? [];
    const names = await namesFor([...list.map((r) => r.reporter_id), ...list.map((r) => r.assignee_id ?? ""), ...(adminRoles ?? []).map((a) => a.user_id)]);
    const count = (rows: Array<{ report_id: string }> | null) => {
      const m: Record<string, number> = {};
      for (const r of rows ?? []) m[r.report_id] = (m[r.report_id] ?? 0) + 1;
      return m;
    };
    const fc = count(files), cc = count(comments);
    const refOf = Object.fromEntries(list.map((r) => [r.id, r.ref_no as number]));
    const dupCount: Record<string, number> = {};
    for (const r of list) if (r.duplicate_of) dupCount[r.duplicate_of] = (dupCount[r.duplicate_of] ?? 0) + 1;
    const rows: AdminQaRow[] = list.map((r) => ({
      id: r.id, ref_no: r.ref_no as number, category: r.category, title: r.title, status: r.status, severity: r.severity,
      assignee_id: r.assignee_id, assignee: r.assignee_id ? names[r.assignee_id] ?? "Admin" : "", reporter_id: r.reporter_id,
      reporter: names[r.reporter_id] ?? "Member", duplicate_of: r.duplicate_of, duplicate_of_ref: r.duplicate_of ? refOf[r.duplicate_of] ?? null : null,
      duplicates: dupCount[r.id] ?? 0, page_path: r.page_path, browser: r.browser, os: r.os, viewport: r.viewport, app_version: r.app_version,
      description: r.description, expected: r.expected, actual: r.actual, steps: r.steps,
      files: fc[r.id] ?? 0, comments: cc[r.id] ?? 0, created_at: r.created_at, updated_at: r.updated_at,
    }));
    const admins = (adminRoles ?? []).map((a) => ({ id: a.user_id, name: names[a.user_id] ?? "Admin" }));
    return { rows, settings: { ...settings, telegramChatId: await qaTelegramGroup() }, admins };
  });

export const adminGetQaReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ ref: z.number().int().positive() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { attachmentsFor, namesFor } = await import("./qa.server");
    const { data: r } = await supabaseAdmin.from("qa_reports").select("*").eq("ref_no", data.ref).maybeSingle();
    if (!r) throw new Error("No report with that number.");
    const [{ data: comments }, { data: events }, { data: dups }, { data: root }, files] = await Promise.all([
      supabaseAdmin.from("qa_comments").select("id, author_id, from_team, body, internal, created_at").eq("report_id", r.id).order("created_at"),
      supabaseAdmin.from("qa_events").select("id, actor_id, field, from_value, to_value, created_at").eq("report_id", r.id).order("created_at"),
      supabaseAdmin.from("qa_reports").select("id, ref_no, title, status, reporter_id, created_at").eq("duplicate_of", r.id).order("created_at"),
      r.duplicate_of ? supabaseAdmin.from("qa_reports").select("id, ref_no, title, status").eq("id", r.duplicate_of).maybeSingle() : Promise.resolve({ data: null }),
      attachmentsFor([r.id]),
    ]);
    const names = await namesFor([r.reporter_id, r.assignee_id ?? "", ...(comments ?? []).map((c) => c.author_id), ...(events ?? []).map((e) => e.actor_id), ...(dups ?? []).map((d) => d.reporter_id)]);
    return {
      report: { ...r, ref_no: r.ref_no as number, reporter: names[r.reporter_id] ?? "Member", assignee: r.assignee_id ? names[r.assignee_id] ?? "Admin" : "" },
      comments: (comments ?? []).map((c) => ({ ...c, author: names[c.author_id] ?? "Member" })),
      events: (events ?? []).map((e) => ({ ...e, actor: names[e.actor_id] ?? "Member" })),
      duplicates: (dups ?? []).map((d) => ({ ...d, ref_no: d.ref_no as number, reporter: names[d.reporter_id] ?? "Member" })),
      duplicateOf: root ? { ...root, ref_no: root.ref_no as number } : null,
      files: files[r.id] ?? [],
    };
  });

const UpdateIn = z.object({
  id: z.string().uuid(),
  status: z.string().optional(),
  severity: z.string().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  duplicateOfRef: z.string().max(20).nullable().optional(),
});

/** Change status, severity, assignee or duplicate grouping; every change is written to the history. */
export const adminUpdateQaReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateIn.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r } = await supabaseAdmin.from("qa_reports").select("id, status, severity, assignee_id, duplicate_of").eq("id", data.id).maybeSingle();
    if (!r) throw new Error("Report not found.");
    const patch: Record<string, string | null> = {};
    const events: Array<{ field: string; from_value: string | null; to_value: string | null }> = [];
    if (data.status !== undefined && data.status !== r.status) {
      if (!isStatus(data.status)) throw new Error("Unknown status.");
      patch.status = data.status; events.push({ field: "status", from_value: r.status, to_value: data.status });
    }
    if (data.severity !== undefined && data.severity !== r.severity) {
      if (data.severity !== null && !isSeverity(data.severity)) throw new Error("Unknown severity.");
      patch.severity = data.severity; events.push({ field: "severity", from_value: r.severity, to_value: data.severity });
    }
    if (data.assigneeId !== undefined && data.assigneeId !== r.assignee_id) {
      if (data.assigneeId) {
        const { data: role } = await supabaseAdmin.from("user_roles").select("user_id").eq("user_id", data.assigneeId).eq("role", "admin").maybeSingle();
        if (!role) throw new Error("Reports can only be assigned to admins.");
      }
      patch.assignee_id = data.assigneeId; events.push({ field: "assignee", from_value: r.assignee_id, to_value: data.assigneeId });
    }
    if (data.duplicateOfRef !== undefined) {
      let target: { id: string; duplicate_of: string | null } | null = null;
      if (data.duplicateOfRef && data.duplicateOfRef.trim()) {
        const n = parseRef(data.duplicateOfRef);
        if (n == null) throw new Error("Use a report number like QA-0012.");
        const { data: t } = await supabaseAdmin.from("qa_reports").select("id, duplicate_of").eq("ref_no", n).maybeSingle();
        const { count } = await supabaseAdmin.from("qa_reports").select("id", { count: "exact", head: true }).eq("duplicate_of", r.id);
        const why = duplicateProblem({ id: r.id, hasDuplicates: (count ?? 0) > 0 }, t ?? null);
        if (why) throw new Error(why);
        target = t!;
      }
      const next = target?.id ?? null;
      if (next !== r.duplicate_of) { patch.duplicate_of = next; events.push({ field: "duplicate_of", from_value: r.duplicate_of, to_value: next }); }
    }
    if (!events.length) return { changed: 0 };
    const { error } = await supabaseAdmin.from("qa_reports").update(patch as never).eq("id", r.id);
    if (error) throw new Error(error.message.includes("duplicate") ? error.message : "Couldn't save the change.");
    await supabaseAdmin.from("qa_events").insert(events.map((e) => ({ ...e, report_id: r.id, actor_id: context.userId })));
    if (patch.status) {
      const { postToQaGroup, namesFor, requestOrigin } = await import("./qa.server");
      const { groupStatusText, reportLink } = await import("./qa-rules");
      const { data: info } = await supabaseAdmin.from("qa_reports").select("ref_no, title").eq("id", r.id).maybeSingle();
      if (info) {
        const names = await namesFor([context.userId]);
        await postToQaGroup(groupStatusText({ ref: info.ref_no as number, title: info.title, from: r.status, to: patch.status, by: names[context.userId] ?? "Seeds team", link: reportLink(await requestOrigin(), info.ref_no as number) }));
      }
    }
    return { changed: events.length };
  });

export const adminCommentQaReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid(), body: z.string().max(8000), internal: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const body = cleanText(data.body, QA_LIMITS.comment);
    if (!body) throw new Error("Write something first.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("qa_comments").insert({ report_id: data.id, author_id: context.userId, from_team: true, body, internal: data.internal });
    if (error) throw new Error("Couldn't save the comment.");
    return { ok: true };
  });

/** The QA switch: off hides the Feedback button and refuses new reports (existing ones stay). */
export const adminSetQaSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ enabled: z.boolean(), recordingsEnabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("qa_settings").update({ enabled: data.enabled, recordings_enabled: data.recordingsEnabled, updated_by: context.userId, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error("Couldn't save the setting.");
    return { ok: true };
  });

/**
 * Which Telegram group gets bug posts (empty = DM admins instead). Saving checks the Seeds bot
 * can see the group and posts a short "connected" note there, so a typo can't silently drop posts.
 */
export const adminSetQaTelegramGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ chatId: z.string().max(30) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const chatId = data.chatId.trim();
    const { validTelegramChatId } = await import("./qa-rules");
    if (chatId && !validTelegramChatId(chatId)) throw new Error("A Telegram group id looks like -1001234567890.");
    if (chatId) {
      const { telegramConfigured, telegramCall, sendTelegram } = await import("@/lib/telegram.server");
      if (!telegramConfigured()) throw new Error("Seeds' Telegram bot isn't set up on this site.");
      try { await telegramCall("getChat", { chat_id: chatId }); }
      catch { throw new Error("The Seeds bot can't see that group. Add the bot to the group first, then try again."); }
      await sendTelegram(chatId, "✅ Seeds bug reports will be posted here (Admin → Bugs).").catch(() => undefined);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("qa_settings").update({ telegram_chat_id: chatId || null, updated_by: context.userId, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error("Couldn't save the setting.");
    return { ok: true };
  });

/* ------------------------- Seeds' own error log (Errors tab) ------------------------- */

export type AdminErrorGroup = {
  signature: string; kind: string; message: string; source: string; first_seen: string; last_seen: string;
  occurrences: number; handled_at: string | null; handled_by: string; last_week: number;
};

export const adminListClientErrors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { namesFor } = await import("./qa.server");
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [{ data: groups }, { data: recent }, { data: s }] = await Promise.all([
      supabaseAdmin.from("client_error_groups").select("*").order("last_seen", { ascending: false }).limit(500),
      supabaseAdmin.from("client_errors").select("signature").gte("created_at", weekAgo).limit(20000),
      supabaseAdmin.from("qa_settings").select("error_log_enabled").eq("id", 1).maybeSingle(),
    ]);
    const week: Record<string, number> = {};
    for (const r of recent ?? []) week[r.signature] = (week[r.signature] ?? 0) + 1;
    const names = await namesFor((groups ?? []).map((g) => g.handled_by ?? ""));
    const rows: AdminErrorGroup[] = (groups ?? []).map((g) => ({
      signature: g.signature, kind: g.kind, message: g.message, source: g.source, first_seen: g.first_seen, last_seen: g.last_seen,
      occurrences: Number(g.occurrences), handled_at: g.handled_at, handled_by: g.handled_by ? names[g.handled_by] ?? "Admin" : "", last_week: week[g.signature] ?? 0,
    }));
    return { rows, enabled: s?.error_log_enabled ?? false };
  });

export const adminGetClientError = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ signature: z.string().regex(/^[0-9a-f]{32}$/) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { namesFor } = await import("./qa.server");
    const { data: rows } = await supabaseAdmin.from("client_errors")
      .select("id, message, source, page_path, browser, os, viewport, app_version, host, account_id, created_at")
      .eq("signature", data.signature).order("created_at", { ascending: false }).limit(50);
    const names = await namesFor((rows ?? []).map((r) => r.account_id ?? ""));
    return { rows: (rows ?? []).map((r) => ({ ...r, account: r.account_id ? names[r.account_id] ?? "Member" : "" })) };
  });

export const adminSetClientErrorHandled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ signature: z.string().regex(/^[0-9a-f]{32}$/), handled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("client_error_groups")
      .update(data.handled ? { handled_at: new Date().toISOString(), handled_by: context.userId } : { handled_at: null, handled_by: null })
      .eq("signature", data.signature);
    if (error) throw new Error("Couldn't save that.");
    return { ok: true };
  });

export const adminSetErrorLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("qa_settings").update({ error_log_enabled: data.enabled, updated_by: context.userId, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw new Error("Couldn't save the setting.");
    return { ok: true };
  });
