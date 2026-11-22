import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BUILD_ID } from "@/lib/qa/build-id";
import { ERRORS_PER_PAGE, errorReportAllowed, ignoredError, scrubErrorMessage } from "@/lib/qa/error-log-rules";
import { scrubPagePath, viewportLabel } from "@/lib/qa/qa-rules";

/**
 * Sends browser errors nobody reported to Seeds' own error log (Admin → Bugs → Errors).
 * Messages are scrubbed here and again on the server; nothing is sent from sign-in, key,
 * security, withdrawal or admin pages; at most ERRORS_PER_PAGE per page load, each message once.
 * No outside service, no replay, no console or network capture.
 */
const sent = new Set<string>();

/** Send one error to the log (also used by the page-crash screen). Never throws. */
export async function sendClientError(kind: "error" | "rejection", raw: unknown, file?: string, line?: number, col?: number): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    if (!errorReportAllowed(window.location.pathname) || sent.size >= ERRORS_PER_PAGE) return;
    const text = raw instanceof Error ? `${raw.name}: ${raw.message}` : typeof raw === "string" ? raw : (() => { try { return JSON.stringify(raw); } catch { return String(raw); } })();
    const message = scrubErrorMessage(text);
    if (!message || ignoredError(message) || sent.has(message)) return;
    sent.add(message);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    await fetch("/api/public/client-error", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        kind, message, file: file || undefined, line: line || undefined, col: col || undefined,
        page: scrubPagePath(window.location.href),
        viewport: viewportLabel(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1),
        appVersion: BUILD_ID,
      }),
    });
  } catch { /* the error log must never cause errors of its own */ }
}

export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => { void sendClientError("error", e.error ?? e.message, e.filename, e.lineno, e.colno); };
    const onRejection = (e: PromiseRejectionEvent) => { void sendClientError("rejection", e.reason); };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);
  return null;
}
