import { useEffect, useRef, useState } from "react";
import { Square } from "lucide-react";
import { QA_RECORDING_MAX_SECONDS } from "@/lib/qa/qa-rules";

export const canRecordScreen = () =>
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== "undefined";

/**
 * A short screen recording (up to 30 s, no sound) made by the browser itself. The tester picks
 * what to share, sees a Stop button while it runs, and watches it before attaching.
 */
export function useScreenRecorder(onFinished: (blob: Blob) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);

  const stop = () => {
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
  };

  const start = async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
    const type = ["video/webm;codecs=vp9", "video/webm", "video/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const mr = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 2_500_000 });
    const chunks: BlobPart[] = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timer.current) window.clearInterval(timer.current);
      setRecording(false);
      const base = (mr.mimeType || type || "video/webm").split(";")[0]!;
      onFinished(new Blob(chunks, { type: base }));
    };
    stream.getVideoTracks()[0]?.addEventListener("ended", stop);
    rec.current = mr;
    mr.start(1000);
    setSeconds(0);
    setRecording(true);
    const began = Date.now();
    timer.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - began) / 1000);
      setSeconds(s);
      if (s >= QA_RECORDING_MAX_SECONDS) stop();
    }, 250);
  };

  useEffect(() => () => { stop(); if (timer.current) window.clearInterval(timer.current); }, []);
  return { recording, seconds, start, stop };
}

export function RecordingPill({ seconds, onStop }: { seconds: number; onStop: () => void }) {
  return (
    <div data-qa-ui className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 z-[60] -translate-x-1/2">
      <button type="button" onClick={onStop} className="flex items-center gap-2 rounded-full bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground shadow-lg">
        <Square className="h-3.5 w-3.5 fill-current" />
        Stop recording · 0:{String(seconds).padStart(2, "0")} / 0:{QA_RECORDING_MAX_SECONDS}
      </button>
    </div>
  );
}
