// Pure rules for Seeds' own anonymous visit counter (shown on /stats). No DOM, no I/O.

/** Only visits to the live site count; preview, localhost and other hosts are ignored. */
export const TRACKED_HOSTS = ["seeds.honest.money", "seeds-cex.lovable.app"] as const;
const OWN_HOSTS = new Set<string>([...TRACKED_HOSTS]);

export function shouldCountHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return OWN_HOSTS.has(host.toLowerCase().replace(/^www\./, ""));
}

/** The counter only accepts beacons sent by Seeds' own pages. */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  if (!origin) return site === "same-origin";
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function isBotUA(ua: string): boolean {
  return !ua || /bot|crawl|spider|slurp|preview|lighthouse|headless|curl|wget|python|playwright|puppeteer/i.test(ua);
}

export function deviceFromUA(ua: string): "desktop" | "mobile" | "tablet" {
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(s)) return "tablet";
  if (/mobi|iphone|android|phone/.test(s)) return "mobile";
  return "desktop";
}

const ID_SEGMENT = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|\d{4,})$/i;

/**
 * Page address as counted: no search terms or #, lowercase, no trailing slash.
 * Personal bits are folded so the public list never shows them: invite codes and
 * long ids (payment links, offers, UUIDs) become "…".
 */
export function normalizePath(raw: string): string {
  let p = String(raw ?? "").split(/[?#]/)[0].trim().toLowerCase();
  if (!p.startsWith("/")) p = "/" + p;
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  const parts = p.split("/").map((seg, i, all) => {
    if (i === 0 || !seg) return seg;
    if (all[i - 1] === "invite") return "…";
    if (ID_SEGMENT.test(seg) || seg.length > 32) return "…";
    return seg;
  });
  return parts.join("/").slice(0, 120) || "/";
}

/** Referring site, or null for direct visits and moves within Seeds. */
export function referrerSource(ref: string | null | undefined): string | null {
  if (!ref) return null;
  let host: string;
  try {
    host = new URL(ref).hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "");
  if (!host || OWN_HOSTS.has(host) || host === "localhost") return null;
  if (/(^|\.)lovable\.(app|dev)$/.test(host) || /(^|\.)lovableproject\.com$/.test(host)) return null;
  if (/^(m|l|lm|mobile)\.facebook\.com$/.test(host)) return "facebook.com";
  if (/^(m|mobile)\.(youtube|twitter|x)\.com$/.test(host)) return host.replace(/^(m|mobile)\./, "");
  return host.slice(0, 100);
}

const FRIENDLY_SOURCES: Record<string, string> = {
  "com.google.android.gm": "Gmail app",
  "com.google.android.googlequicksearchbox": "Google app",
  "org.telegram.messenger": "Telegram app",
  "web.telegram.org": "Telegram",
  "t.me": "Telegram",
  "app.nectar-pay.com": "NectarPay",
  "t.co": "X (Twitter)",
};

/** How a traffic source is shown on /stats. */
export function sourceLabel(host: string): string {
  if (!host) return "Direct / typed in";
  return FRIENDLY_SOURCES[host] ?? host;
}

export const TRAFFIC_RANGES = [7, 30, 90] as const;
export function clampDays(d: unknown): number {
  const n = Math.round(Number(d));
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 365) : 30;
}

/** Every day of the period (Texas time, oldest first), with 0 for days nobody visited. */
export function fillDays<T extends { day: string }>(rows: T[], days: number, now: Date, empty: (day: string) => T): T[] {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(now); // YYYY-MM-DD
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const end = Date.parse(`${today}T12:00:00Z`);
  const out: T[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    out.push(byDay.get(day) ?? empty(day));
  }
  return out;
}
