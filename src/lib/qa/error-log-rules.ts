/**
 * Seeds' own error log (pure, tested): what a browser error may keep before it leaves the
 * page, and again on the server (never trust the browser). Messages are scrubbed of links,
 * emails, addresses/keys/codes and amounts; only Seeds' own script file names are kept;
 * nothing is reported from sign-in, key, security, withdrawal or admin pages.
 */
import { screenshotBlocked, sensitiveRanges } from "./mask-rules";

export const ERROR_MESSAGE_MAX = 500;
export const ERROR_SOURCE_MAX = 200;
/** Errors one page load may send (the same message is sent once). */
export const ERRORS_PER_PAGE = 10;
/** Error reports per minute from one connection. */
export const ERRORS_PER_MINUTE = 20;

const NO_REPORT_PREFIXES = ["/auth", "/sso", "/admin"] as const;

/** Pages that never send errors (same pages as no screenshot, plus sign-in and admin). */
export function errorReportAllowed(pathname: string): boolean {
  const p = (pathname || "/").replace(/\/+$/, "").toLowerCase() || "/";
  if (screenshotBlocked(p)) return false;
  return !NO_REPORT_PREFIXES.some((b) => p === b || p.startsWith(`${b}/`));
}

/** Browser noise that isn't a Seeds bug. */
export function ignoredError(message: string): boolean {
  const m = message.trim();
  if (!m || m === "Script error." || m === "Script error") return true;
  return /ResizeObserver loop|chrome-extension:|moz-extension:|safari-extension:|webkit-masked-url|^AbortError|The user aborted a request|cancelled$/i.test(m);
}

/** A message safe to store: no links, emails, keys, codes or amounts; one line; capped. */
export function scrubErrorMessage(raw: unknown): string {
  let s = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u001f\u007f]+/g, " ");
  s = s.replace(/\b(?:https?|wss?|blob|data):\S+/gi, "[link]");
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]");
  const spans = sensitiveRanges(s);
  for (let i = spans.length - 1; i >= 0; i--) { const [a, b] = spans[i]!; s = `${s.slice(0, a)}[hidden]${s.slice(b)}`; }
  s = s.replace(/(?<![A-Za-z#])\d[\d,]*\.\d+|(?<![A-Za-z#])\d{4,}/g, "#");
  s = s.replace(/\s+/g, " ").trim();
  return s.length > ERROR_MESSAGE_MAX ? `${s.slice(0, ERROR_MESSAGE_MAX - 1)}…` : s;
}

/** Where it broke: only Seeds' own script path + line (never outside scripts, queries or hashes). */
export function scrubErrorSource(file: unknown, line: unknown, col: unknown, ownOrigin: string): string {
  if (typeof file !== "string" || !file) return "";
  let u: URL;
  try { u = new URL(file, ownOrigin); } catch { return ""; }
  if (u.origin !== new URL(ownOrigin).origin) return "[outside script]";
  const path = u.pathname.split("/").map((seg) => (/^[A-Za-z0-9_\-.~%]{48,}$/.test(seg) ? "[hidden]" : seg)).join("/");
  const ln = Number.isInteger(line) && (line as number) > 0 ? `:${line}` : "";
  const cn = ln && Number.isInteger(col) && (col as number) > 0 ? `:${col}` : "";
  return `${path}${ln}${cn}`.slice(0, ERROR_SOURCE_MAX);
}

/** What makes two errors "the same": kind + scrubbed message with every number folded. */
export function signatureBase(kind: string, message: string): string {
  return `${kind}|${message.replace(/\d+/g, "#").toLowerCase()}`;
}

export function hostKind(host: string | null | undefined, liveHosts: ReadonlySet<string>): "live" | "preview" | "other" {
  const h = (host ?? "").toLowerCase().replace(/^www\./, "");
  if (liveHosts.has(h)) return "live";
  if (h === "localhost" || h.endsWith(".lovable.app") || h.endsWith(".lovableproject.com")) return "preview";
  return "other";
}

const tgEsc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Telegram heads-up for an error the log hasn't seen before (or that came back after being handled). */
export function errorAlertText(r: { back: boolean; message: string; pagePath: string; host: string; device: string; link: string }): string {
  return [
    `${r.back ? "♻️ <b>Error is back</b> (was marked handled)" : "🧯 <b>New browser error</b>"} · ${tgEsc(r.host)}`,
    `<code>${tgEsc(r.message.slice(0, 300))}</code>`,
    `Page <code>${tgEsc(r.pagePath || "/")}</code>${r.device ? ` · ${tgEsc(r.device)}` : ""}`,
    `<a href="${tgEsc(r.link)}">Open Admin → Bugs → Errors</a>`,
  ].join("\n");
}
