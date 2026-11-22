/**
 * Tester side of the QA Center. Every function re-checks on the server that the caller is a
 * beta tester (beta role or admin); reads use the caller's own session (row-level security
 * shows only their own reports), writes go through the server only.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasAdminRole, hasTesterRole } from "@/lib/admin-guard";
import {
  QA_LIMITS, QA_MAX_FILES, QA_REPORTS_PER_HOUR, cleanFileName, cleanText, extFor, fileProblem, isCategory, retestResult, scrubPagePath,
} from "./qa-rules";

const NOT_TESTER = "The feedback tools are for Seeds beta testers.";

/** Whether to show the Feedback button: tester + the QA switch on. Never throws for non-testers. */
export const getQaState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tester = await hasTesterRole(context as never);
    if (!tester) return { tester: false, enabled: false, recordingsEnabled: false, admin: false };
    const { qaSettings } = await import("./qa.server");
    const s = await qaSettings();
    return { tester: true, ...s, admin: await hasAdminRole(context as never) };
  });

const FileIn = z.object({
  kind: z.enum(["screenshot", "file", "recording"]),
  mime: z.string().max(80),
  size: z.number().int().positive(),
  name: z.string().max(200),
  redacted: z.boolean(),
});

const ReportIn = z.object({
  category: z.string(),
  title: z.string().max(400),
  description: z.string().max(8000),
  expected: z.string().max(4000),
  actual: z.string().max(4000),
  steps: z.string().max(8000),
  pageHref: z.string().max(4000),
  browser: z.string().max(80),
  os: z.string().max(80),
  viewport: z.string().max(40),
  appVersion: z.string().max(80),
  files: z.array(FileIn).max(QA_MAX_FILES),
});

/** Create a report and hand back one signed upload link per attachment. */
export const submitQaReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReportIn.parse(input))
  .handler(async ({ data, context }) => {
    if (!(await hasTesterRole(context as never))) throw new Error(NOT_TESTER);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { qaSettings, QA_BUCKET } = await import("./qa.server");
    const s = await qaSettings();
    if (!s.enabled) throw new Error("Feedback is switched off right now.");
    if (!isCategory(data.category)) throw new Error("Pick a category.");
    const title = cleanText(data.title, QA_LIMITS.title);
    if (title.length < 3) throw new Error("Give it a short title.");
    for (const f of data.files) {
      const why = fileProblem(f.kind, f.mime, f.size, s.recordingsEnabled);
      if (why) throw new Error(`${cleanFileName(f.name)}: ${why}`);
    }
    if (data.files.length) {
      const { assertQaBucketPrivate } = await import("./qa.server");
      await assertQaBucketPrivate();
    }
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await supabaseAdmin.from("qa_reports").select("id", { count: "exact", head: true }).eq("reporter_id", context.userId).gte("created_at", since);
    if ((count ?? 0) >= QA_REPORTS_PER_HOUR) throw new Error(`That's ${QA_REPORTS_PER_HOUR} reports in the last hour. Please wait a little before sending more.`);

    const { data: row, error } = await supabaseAdmin.from("qa_reports").insert({
      reporter_id: context.userId, category: data.category, title,
      description: cleanText(data.description, QA_LIMITS.description), expected: cleanText(data.expected, QA_LIMITS.expected),
      actual: cleanText(data.actual, QA_LIMITS.actual), steps: cleanText(data.steps, QA_LIMITS.steps),
      page_path: scrubPagePath(data.pageHref), browser: cleanText(data.browser, 80), os: cleanText(data.os, 80),
      viewport: cleanText(data.viewport, 40), app_version: cleanText(data.appVersion, 80),
    }).select("id, ref_no").single();
    if (error || !row) throw new Error("Couldn't save your report. Please try again.");

    const uploads: Array<{ path: string; token: string }> = [];
    for (const f of data.files) {
      const mime = f.mime.split(";")[0]!.trim().toLowerCase();
      const path = `${context.userId}/${row.id}/${crypto.randomUUID()}.${extFor(mime)}`;
      const { error: ae } = await supabaseAdmin.from("qa_attachments").insert({
        report_id: row.id, kind: f.kind, storage_path: path, file_name: cleanFileName(f.name), mime, size_bytes: f.size, redacted: f.redacted,
      });
      if (ae) throw new Error("Couldn't prepare an attachment.");
      const { data: up, error: ue } = await supabaseAdmin.storage.from(QA_BUCKET).createSignedUploadUrl(path);
      if (ue || !up) throw new Error("Couldn't prepare an attachment upload.");
      uploads.push({ path, token: up.token });
    }
    await announceReport({
      ref: row.ref_no as number, reporterId: context.userId, category: data.category, title,
      description: cleanText(data.description, QA_LIMITS.description), expected: cleanText(data.expected, QA_LIMITS.expected),
      actual: cleanText(data.actual, QA_LIMITS.actual), steps: cleanText(data.steps, QA_LIMITS.steps),
      pagePath: scrubPagePath(data.pageHref), device: [cleanText(data.browser, 80), cleanText(data.os, 80), cleanText(data.viewport, 40)].filter(Boolean).join(" · "),
      files: data.files.length,
    }).catch(() => undefined);
    return { id: row.id, ref: row.ref_no as number, uploads };
  });

/**
 * New report → the QA Telegram group (Admin → Bugs) with the report's text; without a group,
 * a short DM to every admin with verified Telegram. Best-effort: never blocks the report.
 */
async function announceReport(r: {
  ref: number; reporterId: string; category: string; title: string; description: string; expected: string; actual: string;
  steps: string; pagePath: string; device: string; files: number;
}) {
  const { qaTelegramGroup, postToQaGroup, namesFor, requestOrigin } = await import("./qa.server");
  if (await qaTelegramGroup()) {
    const { groupReportText, reportLink } = await import("./qa-rules");
    const names = await namesFor([r.reporterId]);
    await postToQaGroup(groupReportText({ ...r, reporter: names[r.reporterId] ?? "A tester", link: reportLink(await requestOrigin(), r.ref) }));
    return;
  }
  await notifyAdmins(r.ref, r.category, r.title);
}

/** Telegram heads-up to every admin with verified Telegram (used when no QA group is set). */
async function notifyAdmins(ref: number, category: string, title: string) {
  const { telegramConfigured, sendTelegram } = await import("@/lib/telegram.server");
  if (!telegramConfigured()) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
  const ids = (roles ?? []).map((r) => r.user_id);
  if (!ids.length) return;
  const { data: people } = await supabaseAdmin.from("profiles").select("telegram_chat_id, telegram_verified").in("id", ids);
  const { categoryLabel, refLabel } = await import("./qa-rules");
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const text = `New ${categoryLabel(category).toLowerCase()} report ${refLabel(ref)}: ${esc(title)}\nOpen Seeds → Admin → Bugs.`;
  await Promise.all((people ?? []).filter((p) => p.telegram_verified && p.telegram_chat_id).map((p) => sendTelegram(String(p.telegram_chat_id), text).catch(() => undefined)));
}

/** After the browser uploaded the files: mark the ones really in storage. */
export const confirmQaUploads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r } = await supabaseAdmin.from("qa_reports").select("id, reporter_id").eq("id", data.id).maybeSingle();
    if (!r || r.reporter_id !== context.userId) throw new Error("Report not found.");
    const { confirmAttachments } = await import("./qa.server");
    return { confirmed: await confirmAttachments(context.userId, r.id) };
  });

/** My own reports, with the team's replies (never team-only notes) and my attachments. */
export const listMyQaReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await hasTesterRole(context as never))) return { tester: false, reports: [] };
    const sb = context.supabase;
    const { data: reports } = await sb.from("qa_reports")
      .select("id, ref_no, category, title, description, expected, actual, steps, status, severity, duplicate_of, page_path, created_at, updated_at")
      .eq("reporter_id", context.userId).order("created_at", { ascending: false }).limit(200);
    const ids = (reports ?? []).map((r) => r.id);
    const { data: comments } = ids.length
      ? await sb.from("qa_comments").select("id, report_id, from_team, body, created_at").in("report_id", ids).eq("internal", false).order("created_at")
      : { data: [] as Array<{ id: string; report_id: string; from_team: boolean; body: string; created_at: string }> };
    const { attachmentsFor } = await import("./qa.server");
    const files = await attachmentsFor(ids);
    return {
      tester: true,
      reports: (reports ?? []).map((r) => ({ ...r, comments: (comments ?? []).filter((c) => c.report_id === r.id), files: files[r.id] ?? [] })),
    };
  });

async function ownReport(userId: string, id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("qa_reports").select("id, reporter_id, status").eq("id", id).maybeSingle();
  if (!data || data.reporter_id !== userId) throw new Error("Report not found.");
  return data;
}

/** Add a note to my own report (visible to the team). */
export const replyToMyQaReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid(), body: z.string().max(8000) }).parse(input))
  .handler(async ({ data, context }) => {
    if (!(await hasTesterRole(context as never))) throw new Error(NOT_TESTER);
    const r = await ownReport(context.userId, data.id);
    const body = cleanText(data.body, QA_LIMITS.comment);
    if (!body) throw new Error("Write something first.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("qa_comments").insert({ report_id: r.id, author_id: context.userId, from_team: false, body, internal: false });
    if (error) throw new Error("Couldn't save your note.");
    return { ok: true };
  });

/** "Fixed for me" / "Still broken" on a report the team marked Ready for retest. */
export const retestMyQaReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid(), worked: z.boolean(), note: z.string().max(8000).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    if (!(await hasTesterRole(context as never))) throw new Error(NOT_TESTER);
    const r = await ownReport(context.userId, data.id);
    const next = retestResult(r.status, data.worked);
    if (!next) throw new Error("This report isn't waiting for a retest.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: moved } = await supabaseAdmin.from("qa_reports").update({ status: next }).eq("id", r.id).eq("status", "ready_for_retest").select("id");
    if (!moved?.length) throw new Error("This report changed meanwhile. Refresh and try again.");
    await supabaseAdmin.from("qa_events").insert({ report_id: r.id, actor_id: context.userId, field: "retest", from_value: r.status, to_value: next });
    {
      const { postToQaGroup, namesFor, requestOrigin } = await import("./qa.server");
      const { groupStatusText, reportLink } = await import("./qa-rules");
      const { data: info } = await supabaseAdmin.from("qa_reports").select("ref_no, title").eq("id", r.id).maybeSingle();
      if (info) {
        const names = await namesFor([context.userId]);
        await postToQaGroup(groupStatusText({ ref: info.ref_no as number, title: info.title, from: r.status, to: next, by: `${names[context.userId] ?? "Tester"} retested`, link: reportLink(await requestOrigin(), info.ref_no as number) }));
      }
    }
    const note = cleanText(data.note ?? "", QA_LIMITS.comment);
    if (note) await supabaseAdmin.from("qa_comments").insert({ report_id: r.id, author_id: context.userId, from_team: false, body: note, internal: false });
    return { status: next };
  });
