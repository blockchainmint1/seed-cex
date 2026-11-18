// Where a visitor goes after Honest.Money sign-in.
//
// The page they started on (often /register) is remembered in BOTH
// sessionStorage and localStorage for 24 hours. sessionStorage covers the
// normal popup / same-tab round trip; localStorage covers visitors who leave
// to join Honest.Money first (the "Join free" link in the HME box) and come
// back in a new tab. Only same-site paths are ever accepted.

const KEY = "seeds-after-signin";
const TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_AFTER_SIGNIN = "/account";

/** Pages that must never be a destination (they'd loop the sign-in). */
const BLOCKED = new Set(["/auth", "/sso"]);

/**
 * Returns a safe, same-site path (with any ?query and #hash) or null.
 * Rejects absolute URLs, protocol-relative "//host", backslash tricks,
 * control characters and the sign-in pages themselves.
 */
export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > 512) return null;
  if (!s.startsWith("/") || s.startsWith("//") || s.includes("\\")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(s)) return null;
  let u: URL;
  try {
    u = new URL(s, "https://seeds.invalid");
  } catch {
    return null;
  }
  if (u.origin !== "https://seeds.invalid") return null;
  const path = u.pathname.replace(/\/+$/, "") || "/";
  if (BLOCKED.has(path)) return null;
  return `${u.pathname}${u.search}${u.hash}`;
}

/**
 * After the remembered page is used it stays readable for 2 minutes, because
 * the Honest.Money popup and the tab that opened it both finish sign-in and
 * both ask where to go. Without this, whichever asked second got Profile.
 */
export const USED_GRACE_MS = 2 * 60 * 1000;

type Stored = { p: string; t: number; u?: number };

/** Remember where to come back to. Ignores unsafe or sign-in paths. */
export function rememberReturnPath(raw: unknown, now = Date.now()): void {
  const p = safeReturnPath(raw);
  if (!p) return;
  let existing: string | null = null;
  try { existing = parseStored(localStorage.getItem(KEY), now); } catch { /* ignore */ }
  if (!shouldReplace(existing, p)) return;
  const v = JSON.stringify({ p, t: now } satisfies Stored);
  try { sessionStorage.setItem(KEY, v); } catch { /* private mode */ }
  try { localStorage.setItem(KEY, v); } catch { /* private mode */ }
}

/**
 * A visitor who leaves /register to join Honest.Money often comes back on
 * the home page and taps the header's Sign in. That generic "/" must not
 * wipe out the specific page they were trying to reach.
 */
export function shouldReplace(existing: string | null, incoming: string): boolean {
  return !(existing && incoming === "/");
}

/** Read a stored value; exported for tests. */
export function parseStored(v: string | null, now = Date.now()): string | null {
  if (!v) return null;
  try {
    const o = JSON.parse(v) as Partial<Stored>;
    if (typeof o.t !== "number" || now - o.t > TTL_MS || o.t > now + 60_000) return null;
    if (typeof o.u === "number" && now - o.u > USED_GRACE_MS) return null;
    return safeReturnPath(o.p);
  } catch {
    // Older builds stored a bare path in sessionStorage.
    return safeReturnPath(v);
  }
}

/** Mark a stored value as used now (kept for USED_GRACE_MS); exported for tests. */
export function markUsed(v: string | null, now = Date.now()): string | null {
  const p = parseStored(v, now);
  if (!p) return null;
  let t = now;
  let u = now;
  try {
    const o = JSON.parse(v as string) as Partial<Stored>;
    if (typeof o.t === "number") t = o.t;
    if (typeof o.u === "number") u = o.u; // first use starts the clock
  } catch { /* bare path */ }
  return JSON.stringify({ p, t, u } satisfies Stored);
}

/**
 * Use the remembered page; falls back to Profile. Every window that finishes
 * the same sign-in within 2 minutes gets the same answer.
 */
export function takeReturnPath(fallback = DEFAULT_AFTER_SIGNIN, now = Date.now()): string {
  let found: string | null = null;
  for (const store of [safeStore("session"), safeStore("local")]) {
    if (!store) continue;
    try {
      const raw = store.getItem(KEY);
      found = found ?? parseStored(raw, now);
      const used = markUsed(raw, now);
      if (used) store.setItem(KEY, used);
      else store.removeItem(KEY);
    } catch { /* ignore */ }
  }
  return found ?? fallback;
}

function safeStore(kind: "session" | "local"): Storage | null {
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}
