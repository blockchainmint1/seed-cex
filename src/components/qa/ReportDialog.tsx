import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Film, Paperclip, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { confirmQaUploads, submitQaReport } from "@/lib/qa/qa.functions";
import {
  QA_CATEGORIES, QA_FILE_ACCEPT, QA_IMAGE_MAX_BYTES, QA_LIMITS, QA_MAX_FILES, cleanFileName, describeDevice, fileProblem, refLabel,
  scrubPagePath, viewportLabel, type QaCategory, type QaFileKind,
} from "@/lib/qa/qa-rules";
import { BUILD_ID } from "@/lib/qa/build-id";
import { screenshotBlocked } from "@/lib/qa/mask-rules";
import { canvasToBlob, captureViewport, type MaskBox } from "./capture";
import { ScreenshotReview } from "./ScreenshotReview";
import { RecordingPill, canRecordScreen, useScreenRecorder } from "./Recorder";

type Attachment = { key: string; kind: QaFileKind; blob: Blob; name: string; redacted: boolean; preview: string };
const field = "w-full rounded-sm border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const label = "font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase";
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));

export function ReportDialog({ open, onOpenChange, recordingsEnabled }: { open: boolean; onOpenChange: (v: boolean) => void; recordingsEnabled: boolean }) {
  const qc = useQueryClient();
  const submit = useServerFn(submitQaReport);
  const confirm = useServerFn(confirmQaUploads);
  const [category, setCategory] = useState<QaCategory>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [steps, setSteps] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [review, setReview] = useState<{ canvas: HTMLCanvasElement; masks: MaskBox[] } | null>(null);
  const [video, setVideo] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useScreenRecorder((blob) => {
    setVideo({ blob, url: URL.createObjectURL(blob) });
    onOpenChange(true);
  });
  const recordable = useMemo(() => recordingsEnabled && canRecordScreen(), [recordingsEnabled]);
  const bugLike = category === "bug" || category === "performance";
  const { pathname } = useLocation();
  const noShot = screenshotBlocked(pathname);

  useEffect(() => () => { files.forEach((f) => URL.revokeObjectURL(f.preview)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (kind: QaFileKind, blob: Blob, name: string, redacted: boolean) => {
    setError(null);
    if (files.length >= QA_MAX_FILES) { setError(`Up to ${QA_MAX_FILES} attachments per report.`); return; }
    const why = fileProblem(kind, blob.type, blob.size, recordingsEnabled);
    if (why) { setError(`${cleanFileName(name)}: ${why}`); return; }
    setFiles((v) => [...v, { key: crypto.randomUUID(), kind, blob, name: cleanFileName(name), redacted, preview: URL.createObjectURL(blob) }]);
  };

  const takeScreenshot = async () => {
    setError(null);
    if (screenshotBlocked(window.location.pathname)) return;
    onOpenChange(false);
    await nextFrame();
    await new Promise((r) => setTimeout(r, 300));
    try {
      setReview(await captureViewport());
    } catch {
      setError("Couldn't take a screenshot on this browser. You can attach one from your device instead.");
    }
    onOpenChange(true);
  };

  const startRecording = async () => {
    setError(null);
    onOpenChange(false);
    try { await recorder.start(); } catch { onOpenChange(true); setError("Recording didn't start (it may have been cancelled)."); }
  };

  const reset = () => {
    files.forEach((f) => URL.revokeObjectURL(f.preview));
    setTitle(""); setDescription(""); setExpected(""); setActual(""); setSteps(""); setFiles([]); setError(null);
  };

  const send = async () => {
    setError(null);
    if (title.trim().length < 3) { setError("Give it a short title."); return; }
    setBusy("Sending…");
    try {
      const device = describeDevice(navigator.userAgent);
      const res = await submit({ data: {
        category, title, description, expected: bugLike ? expected : "", actual: bugLike ? actual : "", steps: bugLike ? steps : "",
        pageHref: scrubPagePath(window.location.href), browser: device.browser, os: device.os,
        viewport: viewportLabel(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1), appVersion: BUILD_ID,
        files: files.map((f) => ({ kind: f.kind, mime: f.blob.type, size: f.blob.size, name: f.name, redacted: f.redacted })),
      } });
      for (let i = 0; i < res.uploads.length; i++) {
        setBusy(`Uploading ${i + 1} of ${res.uploads.length}…`);
        const u = res.uploads[i]!, f = files[i]!;
        const { error: ue } = await supabase.storage.from("qa-attachments").uploadToSignedUrl(u.path, u.token, f.blob, { contentType: f.blob.type.split(";")[0] });
        if (ue) throw new Error(`Your report ${refLabel(res.ref)} was saved, but "${f.name}" didn't upload.`);
      }
      if (res.uploads.length) await confirm({ data: { id: res.id } });
      toast.success(`Thanks! Sent as ${refLabel(res.ref)}.`, { description: "You can follow it under My reports." });
      void qc.invalidateQueries({ queryKey: ["my-qa-reports"] });
      reset();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {recorder.recording ? <RecordingPill seconds={recorder.seconds} onStop={recorder.stop} /> : null}
      <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
        <DialogContent data-qa-ui className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{review ? "Check your screenshot" : video ? "Check your recording" : "Send feedback"}</DialogTitle>
            <DialogDescription>
              {review || video ? "Nothing is sent until you press Send." : "For the Seeds test team. Never include passwords, recovery words, keys or codes."}
            </DialogDescription>
          </DialogHeader>

          {review ? (
            <ScreenshotReview
              source={review.canvas}
              autoMasks={review.masks.length}
              onCancel={() => setReview(null)}
              onDone={async (c, redacted) => {
                try { add("screenshot", await canvasToBlob(c, QA_IMAGE_MAX_BYTES), `screenshot-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.png`, redacted); }
                catch (e) { setError((e as Error).message); }
                setReview(null);
              }}
            />
          ) : video ? (
            <div className="space-y-3">
              <video src={video.url} controls className="max-h-[55vh] w-full rounded-sm border border-border bg-background" />
              <p className="text-sm text-muted-foreground">Watch it through: anything visible in it will be shared with the team.</p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => { URL.revokeObjectURL(video.url); setVideo(null); }}>Don't attach</Button>
                <Button type="button" size="sm" onClick={() => { add("recording", video.blob, `recording.${video.blob.type.includes("mp4") ? "mp4" : "webm"}`, false); URL.revokeObjectURL(video.url); setVideo(null); }}>Attach recording</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Category">
                {QA_CATEGORIES.map((c) => (
                  <button key={c.id} type="button" role="radio" aria-checked={category === c.id} onClick={() => setCategory(c.id)}
                    className={`rounded-sm border px-3 py-2 text-left text-sm ${category === c.id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    <span className="block font-semibold">{c.label}</span>
                    <span className="block text-[11px]">{c.hint}</span>
                  </button>
                ))}
              </div>
              <label className="block space-y-1"><span className={label}>Title</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={QA_LIMITS.title} placeholder="e.g. Swap button does nothing on phone" className={field} />
              </label>
              <label className="block space-y-1"><span className={label}>What happened</span>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={QA_LIMITS.description} rows={3} className={field} />
              </label>
              {bugLike ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1"><span className={label}>What you expected</span>
                      <textarea value={expected} onChange={(e) => setExpected(e.target.value)} maxLength={QA_LIMITS.expected} rows={2} className={field} />
                    </label>
                    <label className="block space-y-1"><span className={label}>What happened instead</span>
                      <textarea value={actual} onChange={(e) => setActual(e.target.value)} maxLength={QA_LIMITS.actual} rows={2} className={field} />
                    </label>
                  </div>
                  <label className="block space-y-1"><span className={label}>Steps to make it happen again</span>
                    <textarea value={steps} onChange={(e) => setSteps(e.target.value)} maxLength={QA_LIMITS.steps} rows={3} placeholder={"1. Open Swap\n2. Pick BTC → PEPE\n3. Press Swap"} className={field} />
                  </label>
                </>
              ) : null}

              <div className="space-y-2">
                <span className={label}>Attachments ({files.length}/{QA_MAX_FILES})</span>
                <div className="flex flex-wrap gap-2">
                  {noShot ? null : <Button type="button" variant="outline" size="sm" onClick={takeScreenshot} disabled={files.length >= QA_MAX_FILES}><Camera className="mr-1 h-4 w-4" />Screenshot this page</Button>}
                  <label className={`inline-flex cursor-pointer items-center rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent ${files.length >= QA_MAX_FILES ? "pointer-events-none opacity-50" : ""}`}>
                    <Paperclip className="mr-1 h-4 w-4" />Attach a file
                    <input type="file" accept={QA_FILE_ACCEPT} multiple className="sr-only" onChange={(e) => { for (const f of Array.from(e.target.files ?? [])) add(f.type.startsWith("video/") ? "recording" : "file", f, f.name, false); e.target.value = ""; }} />
                  </label>
                  {recordable ? <Button type="button" variant="outline" size="sm" onClick={startRecording} disabled={files.length >= QA_MAX_FILES}><Film className="mr-1 h-4 w-4" />Record screen (30 s)</Button> : null}
                </div>
                {noShot ? <p className="text-xs text-muted-foreground">This page shows sign-in codes, keys or withdrawal details, so the page screenshot is off here. You can attach your own picture (black out anything private first) or just describe what you see.</p> : null}
                {files.length ? (
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {files.map((f) => (
                      <li key={f.key} className="relative overflow-hidden rounded-sm border border-border bg-background">
                        {f.blob.type.startsWith("image/") ? <img src={f.preview} alt={f.name} className="h-24 w-full object-cover" /> : f.blob.type.startsWith("video/") ? <video src={f.preview} className="h-24 w-full object-cover" muted /> : <div className="flex h-24 items-center justify-center p-2 text-xs text-muted-foreground">{f.name}</div>}
                        <span className="block truncate px-2 py-1 font-mono text-[10px] text-muted-foreground">{f.name}{f.redacted ? " · blacked out" : ""}</span>
                        <button type="button" aria-label={`Remove ${f.name}`} onClick={() => { URL.revokeObjectURL(f.preview); setFiles((v) => v.filter((x) => x.key !== f.key)); }} className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-foreground"><X className="h-3 w-3" /></button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <p className="text-xs text-muted-foreground">
                Seeds adds the page you're on (without anything after "?"), your browser, system, screen size and app version. It never reads what you typed into the page, your balances or your keys.
              </p>
              {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link to="/feedback" onClick={() => onOpenChange(false)} className="text-sm text-primary underline-offset-4 hover:underline">My reports</Link>
                <Button type="button" onClick={send} disabled={!!busy}>{busy ?? "Send"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
