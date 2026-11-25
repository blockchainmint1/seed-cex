/**
 * Feedback & QA Center rules (pure, tested). Everything the server stores about a report goes
 * through these: categories, statuses, who may move a report where, what a page address may
 * keep, which files are allowed, and the CSV export. See src/lib/qa/AGENTS.md.
 */

export const QA_CATEGORIES = [
  { id: "bug", label: "Bug", hint: "Something is broken or wrong." },
  { id: "performance", label: "Performance", hint: "Slow, stuck or heavy." },
  { id: "feature", label: "Feature request", hint: "Something you wish Seeds did." },
  { id: "general", label: "General feedback", hint: "Anything else." },
] as const;
export type QaCategory = (typeof QA_CATEGORIES)[number]["id"];

export const QA_STATUSES = [
  { id: "new", label: "New" },
  { id: "investigating", label: "Investigating" },
  { id: "fixed", label: "Fixed" },
  { id: "ready_for_retest", label: "Ready for retest" },
  { id: "verified", label: "Verified" },
  { id: "ignored", label: "Ignored" },
] as const;
export type QaStatus = (typeof QA_STATUSES)[number]["id"];

export const QA_SEVERITIES = [
  { id: "critical", label: "Critical" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
] as const;
export type QaSeverity = (typeof QA_SEVERITIES)[number]["id"];

export const categoryLabel = (id: string) => QA_CATEGORIES.find((c) => c.id === id)?.label ?? id;
export const statusLabel = (id: string) => QA_STATUSES.find((s) => s.id === id)?.label ?? id;
export const severityLabel = (id: string | null) => (id ? QA_SEVERITIES.find((s) => s.id === id)?.label ?? id : "Not set");
export const isCategory = (v: string): v is QaCategory => QA_CATEGORIES.some((c) => c.id === v);
export const isStatus = (v: string): v is QaStatus => QA_STATUSES.some((s) => s.id === v);
export const isSeverity = (v: string): v is QaSeverity => QA_SEVERITIES.some((s) => s.id === v);

/** "QA-0042" */
export const refLabel = (n: number) => `QA-${String(n).padStart(4, "0")}`;
/** Accepts "QA-42", "qa-0042" or "42". */
export function parseRef(v: string): number | null {
  const m = v.trim().match(/^(?:qa-?)?0*(\d{1,9})$/i);
  return m ? Number(m[1]) : null;
}

/** Text limits (the database enforces the same). */
export const QA_LIMITS = { title: 140, description: 4000, expected: 2000, actual: 2000, steps: 4000, comment: 4000 } as const;
/** Reports one tester may send per hour. */
export const QA_REPORTS_PER_HOUR = 20;

/** Trim and cap, dropping control characters other than newlines and tabs. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
}

/* ------------------------------- page address ------------------------------- */

/** Query keys a report may keep from the page address; everything else (codes, tokens, links) is dropped. */
export const SAFE_QUERY_KEYS = ["tab", "pair", "market", "range", "side", "kind"] as const;

/**
 * The page a report came from: path plus a short safe list of query keys, never the part after
 * `#`, and long token-looking path pieces replaced, so one-time codes and sign-in links are never stored.
 */
export function scrubPagePath(href: string): string {
  let u: URL;
  try { u = new URL(href, "https://seeds.invalid"); } catch { return ""; }
  const path = u.pathname
    .split("/")
    .map((seg) => (/^[A-Za-z0-9_\-.~%]{32,}$/.test(seg) ? "[hidden]" : seg))
    .join("/")
    .slice(0, 200);
  const keep = new URLSearchParams();
  for (const k of SAFE_QUERY_KEYS) {
    const v = u.searchParams.get(k);
    if (v && /^[A-Za-z0-9_\-./]{1,40}$/.test(v)) keep.set(k, v);
  }
  const q = keep.toString();
  return (q ? `${path}?${q}` : path).slice(0, 300);
}

/* ---------------------------------- device ---------------------------------- */

/** Browser and OS names with major versions from a user-agent string; nothing else from it is kept. */
export function describeDevice(ua: string): { browser: string; os: string } {
  const pick = (re: RegExp) => ua.match(re)?.[1] ?? "";
  let browser = "Other";
  if (/Edg\//.test(ua)) browser = `Edge ${pick(/Edg\/(\d+)/)}`;
  else if (/OPR\//.test(ua)) browser = `Opera ${pick(/OPR\/(\d+)/)}`;
  else if (/SamsungBrowser\//.test(ua)) browser = `Samsung Internet ${pick(/SamsungBrowser\/(\d+)/)}`;
  else if (/Firefox\//.test(ua)) browser = `Firefox ${pick(/Firefox\/(\d+)/)}`;
  else if (/CriOS\//.test(ua)) browser = `Chrome ${pick(/CriOS\/(\d+)/)}`;
  else if (/Chrome\//.test(ua)) browser = `Chrome ${pick(/Chrome\/(\d+)/)}`;
  else if (/Safari\//.test(ua)) browser = `Safari ${pick(/Version\/(\d+)/)}`;
  let os = "Other";
  if (/iPhone|iPad|iPod/.test(ua)) os = `iOS ${pick(/OS (\d+)[_.]/)}`;
  else if (/Android/.test(ua)) os = `Android ${pick(/Android (\d+)/)}`;
  else if (/Windows NT/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/Linux/.test(ua)) os = "Linux";
  return { browser: browser.trim().slice(0, 80), os: os.trim().slice(0, 80) };
}

/** "1495x907@2" from numbers the browser reports; nonsense becomes "". */
export function viewportLabel(w: number, h: number, dpr: number): string {
  if (![w, h, dpr].every((n) => Number.isFinite(n) && n > 0 && n < 20000)) return "";
  return `${Math.round(w)}x${Math.round(h)}@${Math.round(dpr * 100) / 100}`;
}

/* ----------------------------------- files ---------------------------------- */

export type QaFileKind = "screenshot" | "file" | "recording";
export const QA_MAX_FILES = 5;
export const QA_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const QA_RECORDING_MAX_BYTES = 25 * 1024 * 1024;
export const QA_RECORDING_MAX_SECONDS = 30;
const IMAGE = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const DOC = ["application/pdf", "text/plain"];
const VIDEO = ["video/webm", "video/mp4"];
export const QA_FILE_ACCEPT = [...IMAGE, ...DOC, ...VIDEO].join(",");

const EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
  "application/pdf": "pdf", "text/plain": "txt", "video/webm": "webm", "video/mp4": "mp4",
};
export const extFor = (mime: string) => EXT[mime] ?? "bin";

/** Why this file can't be attached, or null. */
export function fileProblem(kind: QaFileKind, mime: string, size: number, recordingsEnabled = true): string | null {
  const base = mime.split(";")[0]!.trim().toLowerCase();
  if (!(size > 0)) return "That file is empty.";
  if (kind === "screenshot") {
    if (!IMAGE.includes(base)) return "Screenshots must be images.";
    if (size > QA_IMAGE_MAX_BYTES) return "That screenshot is over 10 MB.";
    return null;
  }
  if (kind === "recording") {
    if (!recordingsEnabled) return "Screen recordings are switched off right now.";
    if (!VIDEO.includes(base)) return "Recordings must be WebM or MP4 video.";
    if (size > QA_RECORDING_MAX_BYTES) return "That recording is over 25 MB. Keep it to 30 seconds.";
    return null;
  }
  if (VIDEO.includes(base)) {
    if (!recordingsEnabled) return "Video files are switched off right now.";
    return size > QA_RECORDING_MAX_BYTES ? "That video is over 25 MB." : null;
  }
  if (![...IMAGE, ...DOC].includes(base)) return "Only images, PDF, plain text or short video can be attached.";
  return size > QA_IMAGE_MAX_BYTES ? "That file is over 10 MB." : null;
}

/** A safe file name to show (never used as the stored path). */
export function cleanFileName(name: string): string {
  return name.replace(/[^\w.\- ()]+/g, "_").replace(/^\.+/, "").slice(0, 120) || "file";
}

/* --------------------------------- workflow --------------------------------- */

/** The reporter's answer when the team asks them to retest: only from Ready for retest. */
export function retestResult(status: string, worked: boolean): QaStatus | null {
  if (status !== "ready_for_retest") return null;
  return worked ? "verified" : "investigating";
}

/** Reports still needing the team (not Verified, not a duplicate). */
export const isOpenReport = (r: { status: string; duplicate_of: string | null }) => r.status !== "verified" && r.status !== "ignored" && !r.duplicate_of;

/** A report may be marked a duplicate only of a different, original (non-duplicate) report, and only if nothing points at it. */
export function duplicateProblem(self: { id: string; hasDuplicates: boolean }, target: { id: string; duplicate_of: string | null } | null): string | null {
  if (!target) return "No report with that number.";
  if (target.id === self.id) return "A report can't be a duplicate of itself.";
  if (target.duplicate_of) return "That report is itself a duplicate. Pick the original.";
  if (self.hasDuplicates) return "Other reports are duplicates of this one, so it can't become a duplicate.";
  return null;
}

/* ------------------------------------ csv ----------------------------------- */

export type QaCsvRow = {
  ref_no: number; created_at: string; category: string; status: string; severity: string | null; title: string;
  reporter: string; assignee: string; duplicate_of_ref: number | null; page_path: string; browser: string; os: string;
  viewport: string; app_version: string; description: string; expected: string; actual: string; steps: string;
};

const cell = (v: string | number | null) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function qaCsv(rows: QaCsvRow[]): string {
  const head = ["Ref", "Reported", "Category", "Status", "Severity", "Title", "Reporter", "Assignee", "Duplicate of", "Page", "Browser", "OS", "Screen", "App version", "Description", "Expected", "Actual", "Steps"];
  const body = rows.map((r) => [
    refLabel(r.ref_no), r.created_at, categoryLabel(r.category), statusLabel(r.status), severityLabel(r.severity), r.title,
    r.reporter, r.assignee, r.duplicate_of_ref ? refLabel(r.duplicate_of_ref) : "", r.page_path, r.browser, r.os, r.viewport,
    r.app_version, r.description, r.expected, r.actual, r.steps,
  ].map(cell).join(","));
  return [head.join(","), ...body].join("\n");
}

// ---- Telegram group posts (Admin → Bugs → Telegram group) ----

/** A Telegram chat id: digits, groups start with "-" (supergroups "-100…"). */
export const validTelegramChatId = (v: string) => /^-?[0-9]{5,20}$/.test(v);
export const QA_GROUP_EXCERPT = 600;

const tgEsc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const excerpt = (v: string, n: number) => (v.length > n ? `${v.slice(0, n - 1).trimEnd()}…` : v);

/**
 * New report → group post. Text only: screenshots, files and recordings stay in Seeds'
 * private storage (the post says how many and links to Admin → Bugs).
 */
export function groupReportText(r: {
  ref: number; category: string; title: string; description: string; expected: string; actual: string; steps: string;
  pagePath: string; reporter: string; device: string; files: number; link: string;
}): string {
  const lines = [
    `🐞 <b>${refLabel(r.ref)} · ${tgEsc(categoryLabel(r.category))}</b>`,
    `<b>${tgEsc(r.title)}</b>`,
    `From ${tgEsc(r.reporter)} · <code>${tgEsc(r.pagePath || "/")}</code>`,
  ];
  if (r.device) lines.push(tgEsc(r.device));
  for (const [label, v] of [["What happened", r.description], ["Expected", r.expected], ["Instead", r.actual], ["Steps", r.steps]] as const)
    if (v.trim()) lines.push(`\n<b>${label}:</b> ${tgEsc(excerpt(v.trim(), QA_GROUP_EXCERPT))}`);
  if (r.files) lines.push(`\n📎 ${r.files} attachment${r.files === 1 ? "" : "s"} (open in Seeds)`);
  lines.push(`\n<a href="${tgEsc(r.link)}">Open ${refLabel(r.ref)} in Admin → Bugs</a>`);
  return lines.join("\n");
}

/** Status change (team triage or a tester's retest answer) → one-line group post. */
export function groupStatusText(r: { ref: number; title: string; from: string; to: string; by: string; link: string }): string {
  return `🔁 <b>${refLabel(r.ref)}</b> ${tgEsc(statusLabel(r.from))} → <b>${tgEsc(statusLabel(r.to))}</b> (${tgEsc(r.by)})\n${tgEsc(r.title)}\n<a href="${tgEsc(r.link)}">Open in Admin → Bugs</a>`;
}

/** Link to a report on the site the action happened on. */
export const reportLink = (origin: string, ref: number) => `${origin.replace(/\/+$/, "")}/admin/bugs/${ref}`;

// ---- Attachment storage must stay private ----

/**
 * Uploads go ahead only when the storage bucket answers and says it is private. Anything
 * else (missing, unreadable, public, or no clear answer) refuses the upload.
 */
export function bucketSafeForUploads(b: { public?: unknown } | null | undefined): boolean {
  return !!b && b.public === false;
}
