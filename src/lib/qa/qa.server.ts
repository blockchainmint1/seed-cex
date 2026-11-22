/** Server-only helpers for the QA Center (storage, settings, attachments). */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { QA_IMAGE_MAX_BYTES, QA_RECORDING_MAX_BYTES, bucketSafeForUploads } from "./qa-rules";

export const QA_BUCKET = "qa-attachments";
/** Signed links to view an attachment last this long (seconds). */
export const QA_VIEW_SECONDS = 120;

let bucketOkAt = 0;
let lastBucketAlert = 0;
export const QA_BUCKET_NOT_PRIVATE = "Attachments are paused: Seeds' private file storage isn't confirmed private right now. Send the report without files, and the team has been told.";

/**
 * Refuse uploads unless the attachments bucket says it is private (checked at most once a
 * minute per server instance; a bad answer is never cached). The first refusal each hour
 * posts a warning to the QA group / admins.
 */
export async function assertQaBucketPrivate(): Promise<void> {
  if (Date.now() - bucketOkAt < 60_000) return;
  let bucket: { public?: unknown } | null = null;
  try {
    const { data } = await supabaseAdmin.storage.getBucket(QA_BUCKET);
    bucket = data;
  } catch { bucket = null; }
  if (bucketSafeForUploads(bucket)) { bucketOkAt = Date.now(); return; }
  bucketOkAt = 0;
  console.error("QA attachments bucket is not confirmed private; uploads refused.");
  if (Date.now() - lastBucketAlert > 3600_000) {
    lastBucketAlert = Date.now();
    await postToQaGroup("⚠️ <b>Feedback attachments paused</b>\nSeeds' QA file storage isn't confirmed private, so new screenshots and files are being refused. Reports without files still go through. Please check the storage settings.");
  }
  throw new Error(QA_BUCKET_NOT_PRIVATE);
}

let errorLogCache: { at: number; on: boolean } | null = null;
/** Admin → Bugs → Errors switch (cached a minute per server instance). */
export async function errorLogEnabled(): Promise<boolean> {
  if (errorLogCache && Date.now() - errorLogCache.at < 60_000) return errorLogCache.on;
  const { data } = await supabaseAdmin.from("qa_settings").select("error_log_enabled").eq("id", 1).maybeSingle();
  const on = data?.error_log_enabled ?? false;
  errorLogCache = { at: Date.now(), on };
  return on;
}

export async function qaSettings(): Promise<{ enabled: boolean; recordingsEnabled: boolean }> {
  const { data } = await supabaseAdmin.from("qa_settings").select("enabled, recordings_enabled").eq("id", 1).maybeSingle();
  return { enabled: data?.enabled ?? false, recordingsEnabled: data?.recordings_enabled ?? false };
}

/** The Telegram group that gets QA posts, or null (then new reports DM verified admins). Admin-only value. */
export async function qaTelegramGroup(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("qa_settings").select("telegram_chat_id").eq("id", 1).maybeSingle();
  return data?.telegram_chat_id ?? null;
}

/** Best-effort post to the QA group; never throws (a report or triage must not fail because Telegram did). */
export async function postToQaGroup(text: string): Promise<boolean> {
  try {
    const { telegramConfigured, sendTelegram } = await import("@/lib/telegram.server");
    const chat = await qaTelegramGroup();
    if (!chat || !telegramConfigured()) return false;
    await sendTelegram(chat, text);
    return true;
  } catch (e) {
    console.error("QA group post failed:", (e as Error).message);
    return false;
  }
}

/** Origin of the current request (preview or live), for links in group posts. */
export async function requestOrigin(): Promise<string> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    return new URL(getRequest().url).origin;
  } catch { return "https://seeds.honest.money"; }
}

export type QaAttachmentView = { id: string; kind: string; mime: string; fileName: string; size: number; redacted: boolean; url: string | null };

/** Uploaded attachments of these reports, each with a short-lived signed view link. */
export async function attachmentsFor(reportIds: string[]): Promise<Record<string, QaAttachmentView[]>> {
  if (!reportIds.length) return {};
  const { data } = await supabaseAdmin.from("qa_attachments").select("id, report_id, kind, storage_path, mime, file_name, size_bytes, redacted")
    .in("report_id", reportIds).eq("uploaded", true).order("created_at");
  const rows = data ?? [];
  const signed = rows.length ? (await supabaseAdmin.storage.from(QA_BUCKET).createSignedUrls(rows.map((r) => r.storage_path), QA_VIEW_SECONDS)).data ?? [] : [];
  const out: Record<string, QaAttachmentView[]> = {};
  rows.forEach((r, i) => {
    (out[r.report_id] ??= []).push({ id: r.id, kind: r.kind, mime: r.mime, fileName: r.file_name, size: r.size_bytes, redacted: r.redacted, url: signed[i]?.signedUrl ?? null });
  });
  return out;
}

/**
 * Mark a report's attachments uploaded once the file really is in storage with an allowed size
 * and type; a file that doesn't match what was declared is removed and never shown.
 */
export async function confirmAttachments(reporterId: string, reportId: string): Promise<number> {
  const { data: rows } = await supabaseAdmin.from("qa_attachments").select("id, storage_path, kind, mime").eq("report_id", reportId).eq("uploaded", false);
  if (!rows?.length) return 0;
  const { data: files } = await supabaseAdmin.storage.from(QA_BUCKET).list(`${reporterId}/${reportId}`, { limit: 20 });
  let ok = 0;
  for (const r of rows) {
    const name = r.storage_path.split("/").pop();
    const f = (files ?? []).find((x) => x.name === name);
    if (!f) continue;
    const meta = (f.metadata ?? {}) as { size?: number; mimetype?: string };
    const size = Number(meta.size ?? 0);
    const mime = String(meta.mimetype ?? "").split(";")[0];
    const cap = r.kind === "recording" || r.mime.startsWith("video/") ? QA_RECORDING_MAX_BYTES : QA_IMAGE_MAX_BYTES;
    if (!(size > 0) || size > cap || mime !== r.mime) {
      await supabaseAdmin.storage.from(QA_BUCKET).remove([r.storage_path]);
      continue;
    }
    const { error } = await supabaseAdmin.from("qa_attachments").update({ uploaded: true, size_bytes: size }).eq("id", r.id);
    if (!error) ok++;
  }
  return ok;
}

/** Display names for these accounts. */
export async function namesFor(ids: string[]): Promise<Record<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return {};
  const { data } = await supabaseAdmin.from("profiles").select("id, display_name").in("id", uniq);
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.display_name || "Member"]));
}
