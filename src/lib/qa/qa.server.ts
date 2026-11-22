/** Server-only helpers for the QA Center (storage, settings, attachments). */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { QA_IMAGE_MAX_BYTES, QA_RECORDING_MAX_BYTES } from "./qa-rules";

export const QA_BUCKET = "qa-attachments";
/** Signed links to view an attachment last this long (seconds). */
export const QA_VIEW_SECONDS = 120;

export async function qaSettings(): Promise<{ enabled: boolean; recordingsEnabled: boolean }> {
  const { data } = await supabaseAdmin.from("qa_settings").select("enabled, recordings_enabled").eq("id", 1).maybeSingle();
  return { enabled: data?.enabled ?? false, recordingsEnabled: data?.recordings_enabled ?? false };
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
