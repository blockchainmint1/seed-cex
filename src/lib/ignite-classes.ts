/**
 * Pure rules for Ignite classes (no I/O, tested): prices and the HME-miner
 * discount, schedule wording, what an admin may save, and how Honest.Money's
 * miner-status answer is read. Prices shown in the browser are display only;
 * checkout always re-computes them on the server from the stored class.
 */

export type ClassSession = { starts_at: string; ends_at: string };
export type AgendaItem = { title: string; detail: string };
export type IgniteClassPublic = {
  id: string; slug: string; name: string; tagline: string | null; status: "draft" | "open" | "closed" | "done";
  instructorName: string; instructorBio: string | null; instructorPhotoUrl: string | null;
  capacity: number; feeUsd: number; depositUsd: number; minersFree: boolean; timezone: string;
  sessions: ClassSession[]; location: string; requirements: string | null;
  agenda: AgendaItem[]; benefits: string[]; startsAt: string | null; endsAt: string | null;
};

export const CLASS_STATUSES = ["draft", "open", "closed", "done"] as const;
export type ClassStatus = (typeof CLASS_STATUSES)[number];
/** Paths under /to-the-moon that a class can never take. */
export const RESERVED_SLUGS = ["confirmed", "classes", "interest"] as const;
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** What every class teaches unless the admin writes its own agenda. */
export const DEFAULT_AGENDA: AgendaItem[] = [
  { title: "Wallet foundations", detail: "Download, set up and use a crypto wallet, and keep your recovery phrase safe." },
  { title: "Getting started", detail: "Get into crypto and move into TSD, the Texas Stable Dollar." },
  { title: "Exchange essentials", detail: "Find your way around Seeds: buy orders, sell orders and how trades settle." },
  { title: "Your first trades", detail: "Put your trade deposit to work in TXC, ISK, ZCU and TSD with guidance." },
  { title: "Strategy baskets", detail: "Build a strategy with the Seeds AI basket builder and test it against past prices." },
  { title: "Ecosystem connections", detail: "How Seeds, Crypto U and the Honest Money tools fit together." },
];

/** What every seat comes with unless the admin writes its own list. */
export const DEFAULT_BENEFITS: string[] = [
  "A free Cold Storage Coin",
  "Watch the class recording any time",
  "Come back and attend again with the same instructor any time",
  "Your trade deposit comes back to you during class to trade with",
  "Free for HME miners",
];

export const classAgenda = (a: AgendaItem[] | null | undefined) => (a && a.length ? a : DEFAULT_AGENDA);
export const classBenefits = (b: string[] | null | undefined, minersFree = true) =>
  (b && b.length ? b : DEFAULT_BENEFITS.filter((x) => minersFree || x !== "Free for HME miners"));

/** Whether a member's miner status is known: "miner", "not_miner", or "unknown" (couldn't check). */
export type MinerStatus = "miner" | "not_miner" | "unknown";

export type ClassPrice = { feeUsd: number; minerDiscountUsd: number; depositUsd: number; totalUsd: number };

const money = (n: number) => Math.round(Math.max(0, Number(n) || 0) * 100) / 100;

/**
 * What a seat costs. HME miners attend free: the class fee is waived when the
 * class says miners are free and the miner check says "miner". The trade
 * deposit is never discounted (it comes back to them during class).
 */
export function classPrice(c: { feeUsd: number; depositUsd: number; minersFree: boolean }, miner: MinerStatus): ClassPrice {
  const feeUsd = money(c.feeUsd);
  const depositUsd = money(c.depositUsd);
  const minerDiscountUsd = c.minersFree && miner === "miner" ? feeUsd : 0;
  return { feeUsd, minerDiscountUsd, depositUsd, totalUsd: money(feeUsd - minerDiscountUsd + depositUsd) };
}

/** Seats still open, never negative. `held` = confirmed + live checkouts. */
export const classSeatsLeft = (capacity: number, held: number) => Math.max(0, capacity - Math.max(0, held));

/** A class people can still sign up for right now. */
export function canRegister(c: { status: string; endsAt?: string | null; startsAt?: string | null }, seatsLeft: number, now = Date.now()) {
  if (c.status !== "open" || seatsLeft <= 0) return false;
  const last = c.endsAt ?? c.startsAt;
  return !last || new Date(last).getTime() > now;
}

/** Classes shown on /ignite: published, not finished, last session not over. Soonest first. */
export function upcomingClasses<T extends { status: string; startsAt: string | null; endsAt: string | null }>(list: T[], now = Date.now()): T[] {
  return list
    .filter((c) => c.status !== "draft" && c.status !== "done" && (!c.endsAt || new Date(c.endsAt).getTime() > now))
    .sort((a, b) => (a.startsAt ? new Date(a.startsAt).getTime() : Infinity) - (b.startsAt ? new Date(b.startsAt).getTime() : Infinity));
}

// ---- Schedule wording ----

function parts(iso: string, tz: string) {
  const d = new Date(iso);
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: tz, ...o }).format(d);
  return { d, weekday: f({ weekday: "short" }), month: f({ month: "long" }), day: f({ day: "numeric" }), year: f({ year: "numeric" }), time: f({ hour: "numeric", minute: "2-digit" }) };
}
/** "CST" / "CDT" style short zone name for a moment in a zone. */
export function zoneAbbr(iso: string, tz: string) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date(iso));
  return p.find((x) => x.type === "timeZoneName")?.value ?? tz;
}
/** "1:00 PM" + "5:00 PM" → "1–5 PM"; "11:30 AM" + "1:00 PM" → "11:30 AM–1 PM". */
function clockRange(s: string, e: string) {
  const short = (t: string) => t.replace(":00", "");
  const same = s.slice(-2) === e.slice(-2);
  return `${same ? short(s).slice(0, -3) : short(s)}–${short(e).replace(" ", "\u00a0")}`;
}

/** "November 30–December 4, 2026" / "December 5–6, 2026" / "December 5, 2026". */
export function dateRangeLabel(sessions: ClassSession[], tz: string): string {
  if (!sessions.length) return "Dates coming soon";
  const a = parts(sessions[0]!.starts_at, tz);
  const b = parts(sessions[sessions.length - 1]!.starts_at, tz);
  if (a.month === b.month && a.day === b.day && a.year === b.year) return `${a.month} ${a.day}, ${a.year}`;
  if (a.month === b.month && a.year === b.year) return `${a.month} ${a.day}–${b.day}, ${a.year}`;
  if (a.year === b.year) return `${a.month} ${a.day}–${b.month} ${b.day}, ${a.year}`;
  return `${a.month} ${a.day}, ${a.year}–${b.month} ${b.day}, ${b.year}`;
}

/** "5:00–6:30 PM CST" when every session runs at the same local time, else null. */
export function sharedTimeLabel(sessions: ClassSession[], tz: string): string | null {
  if (!sessions.length) return null;
  const label = (s: ClassSession) => `${parts(s.starts_at, tz).time}–${parts(s.ends_at, tz).time} ${zoneAbbr(s.starts_at, tz)}`;
  const first = label(sessions[0]!);
  if (!sessions.every((s) => label(s) === first)) return null;
  const s = parts(sessions[0]!.starts_at, tz).time;
  const e = parts(sessions[0]!.ends_at, tz).time;
  const sameHalf = s.slice(-2) === e.slice(-2);
  return `${sameHalf ? s.slice(0, -3) : s}–${e} ${zoneAbbr(sessions[0]!.starts_at, tz)}`;
}

/** "2 sessions · 4 hours each" / "5 sessions · 90 minutes each". */
export function sessionsLabel(sessions: ClassSession[]): string {
  if (!sessions.length) return "Sessions coming soon";
  const mins = sessions.map((s) => Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60_000));
  const n = `${sessions.length} live session${sessions.length === 1 ? "" : "s"}`;
  if (!mins.every((m) => m === mins[0])) return n;
  const m = mins[0]!;
  const len = m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} minutes`;
  return `${n} · ${len} each`;
}

/** One line per session: "Sat, December 5 · 1–5 PM CST". */
export function sessionLines(sessions: ClassSession[], tz: string): string[] {
  return sessions.map((s) => {
    const a = parts(s.starts_at, tz);
    const e = parts(s.ends_at, tz);
    return `${a.weekday}, ${a.month} ${a.day} · ${clockRange(a.time, e.time)} ${zoneAbbr(s.starts_at, tz)}`;
  });
}

/** The first session's start as "Dec 5, 1:00 PM CST" (Telegram notes). */
export function firstSessionShort(sessions: ClassSession[], tz: string): string | null {
  if (!sessions.length) return null;
  const a = parts(sessions[0]!.starts_at, tz);
  return `${a.month.slice(0, 3)} ${a.day}, ${a.time} ${zoneAbbr(sessions[0]!.starts_at, tz)}`;
}

/** Earliest start and latest end, stored on the class for sorting and seat rules. */
export function classSpan(sessions: ClassSession[]): { startsAt: string | null; endsAt: string | null } {
  if (!sessions.length) return { startsAt: null, endsAt: null };
  const s = sessions.map((x) => new Date(x.starts_at).getTime());
  const e = sessions.map((x) => new Date(x.ends_at).getTime());
  return { startsAt: new Date(Math.min(...s)).toISOString(), endsAt: new Date(Math.max(...e)).toISOString() };
}

// ---- What an admin may save ----

export type ClassInput = {
  slug: string; name: string; tagline: string; status: string;
  instructorName: string; instructorBio: string; instructorPhotoUrl: string;
  capacity: number; feeUsd: number; depositUsd: number; minersFree: boolean; timezone: string;
  sessions: ClassSession[]; location: string; requirements: string; agenda: AgendaItem[]; benefits: string[];
};
export const TIMEZONES = [
  { v: "America/Chicago", label: "Central Time" },
  { v: "America/New_York", label: "Eastern Time" },
  { v: "America/Denver", label: "Mountain Time" },
  { v: "America/Los_Angeles", label: "Pacific Time" },
  { v: "UTC", label: "UTC" },
] as const;

/** Problems with a class form, keyed by field. Empty object = OK to save. */
export function validateClass(c: ClassInput, opts: { held?: number } = {}): Record<string, string> {
  const e: Record<string, string> = {};
  if (!SLUG_RE.test(c.slug) || c.slug.length > 40) e.slug = "Use lowercase letters, numbers and dashes, like spark or winter-class.";
  else if ((RESERVED_SLUGS as readonly string[]).includes(c.slug)) e.slug = "That address is already used by another page.";
  if (c.name.trim().length < 2 || c.name.trim().length > 60) e.name = "Give the class a name (up to 60 characters).";
  if (c.tagline.length > 200) e.tagline = "Keep the short line under 200 characters.";
  if (!(CLASS_STATUSES as readonly string[]).includes(c.status)) e.status = "Pick a status.";
  if (c.instructorName.trim().length < 2 || c.instructorName.trim().length > 80) e.instructorName = "Add the instructor's name.";
  if (c.instructorBio.length > 600) e.instructorBio = "Keep the bio under 600 characters.";
  if (c.instructorPhotoUrl && !/^https:\/\//.test(c.instructorPhotoUrl)) e.instructorPhotoUrl = "Upload a photo instead of pasting a link.";
  if (!Number.isInteger(c.capacity) || c.capacity < 1 || c.capacity > 5000) e.capacity = "Seats must be a whole number from 1 to 5,000.";
  else if (opts.held != null && c.capacity < opts.held) e.capacity = `${opts.held} seats are already taken, so this can't go below ${opts.held}.`;
  if (!Number.isFinite(c.feeUsd) || c.feeUsd < 0 || c.feeUsd > 100000) e.feeUsd = "Enter a class fee of $0 or more.";
  if (!Number.isFinite(c.depositUsd) || c.depositUsd < 0 || c.depositUsd > 100000) e.depositUsd = "Enter a trade deposit of $0 or more.";
  if (c.feeUsd + c.depositUsd > 0 && c.feeUsd + c.depositUsd < 1) e.feeUsd = "The total must be at least $1 (NectarPay's smallest invoice).";
  if (!TIMEZONES.some((t) => t.v === c.timezone)) e.timezone = "Pick a time zone.";
  if (c.sessions.length > 20) e.sessions = "At most 20 sessions.";
  for (const s of c.sessions) {
    const a = new Date(s.starts_at).getTime();
    const b = new Date(s.ends_at).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) { e.sessions = "Every session needs a start and end time."; break; }
    if (b <= a) { e.sessions = "Each session must end after it starts."; break; }
    if (b - a > 12 * 3_600_000) { e.sessions = "A session can't be longer than 12 hours."; break; }
  }
  if (c.status === "open" && !c.sessions.length) e.sessions = "Add the session times before opening registration.";
  if (c.location.length > 120) e.location = "Keep the location under 120 characters.";
  if (c.requirements.length > 2000) e.requirements = "Keep requirements under 2,000 characters.";
  if (c.agenda.length > 20 || c.agenda.some((a) => a.title.trim().length < 2 || a.title.length > 80 || a.detail.length > 300)) e.agenda = "Each agenda item needs a title (up to 80 characters) and a short description (up to 300).";
  if (c.benefits.length > 12 || c.benefits.some((b) => b.trim().length < 2 || b.length > 120)) e.benefits = "Each benefit needs 2–120 characters (up to 12 benefits).";
  return e;
}

// ---- Honest.Money miner-status answer ----

/**
 * Reads Honest.Money's POST /api/public/minetxc/miner-status answer for one member.
 * Miner = any live hash power on any mining site. Not a miner = Honest.Money found the
 * member and at least one mining site answered with none. Anything else is unknown,
 * so a member is never charged as a non-miner just because a site was down.
 */
export function minerFromStatus(hmeId: string, answer: unknown): MinerStatus {
  const results = (answer as { results?: unknown })?.results;
  if (!Array.isArray(results)) return "unknown";
  const r = results.find((x) => (x as { hmeId?: unknown })?.hmeId === hmeId) as
    | { result?: unknown; totalHashMhs?: unknown; checked?: unknown; miner?: unknown }
    | undefined;
  if (!r || r.result !== "found") return "unknown";
  const total = Number(r.totalHashMhs);
  if (Number.isFinite(total) && total > 0) return "miner";
  if (r.miner === true) return "miner";
  const checked = Array.isArray(r.checked) ? r.checked.length : 0;
  if (r.miner === false && checked > 0 && Number.isFinite(total) && total === 0) return "not_miner";
  return "unknown";
}

/** An admin's mark wins over the automatic check either way. */
export function resolveMiner(mark: boolean | null | undefined, auto: MinerStatus): MinerStatus {
  if (mark === true) return "miner";
  if (mark === false) return "not_miner";
  return auto;
}

/** Interest-list emails skip anyone unsubscribed and, unless asked, anyone who already has a paid seat. */
export function interestRecipients<T extends { email: string; unsubscribedAt: string | null; hasSeat: boolean }>(rows: T[], includeSeated: boolean): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (r.unsubscribedAt || (!includeSeated && r.hasSeat) || seen.has(r.email)) return false;
    seen.add(r.email);
    return true;
  });
}

/** Instructor photos are served by Seeds itself; drop the host so the photo also shows on preview copies of the site. */
export function photoSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  const p = "https://seeds.honest.money/api/public/ignite-photo/";
  return url.startsWith(p) ? `/api/public/ignite-photo/${url.slice(p.length)}` : url;
}

const usd0 = (n: number) => `$${Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(2)}`;
/** "$99 class + $400 trade deposit" / "$400 trade deposit" — the headline price for a class. */
export function priceLine(c: { feeUsd: number; depositUsd: number }): string {
  if (c.feeUsd > 0 && c.depositUsd > 0) return `${usd0(c.feeUsd)} class + ${usd0(c.depositUsd)} trade deposit`;
  if (c.feeUsd > 0) return `${usd0(c.feeUsd)} class fee`;
  return c.depositUsd > 0 ? `${usd0(c.depositUsd)} trade deposit` : "Free";
}
export { usd0 };

// ---- Admin form: wall-clock times in the class's time zone <-> stored UTC ----

function zoneOffsetMs(utcMs: number, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour! % 24, +p.minute!, +p.second!);
  return asUtc - utcMs;
}

/** "2026-12-05" + "13:00" in America/Chicago → "2026-12-05T19:00:00.000Z". Null when the inputs don't parse. */
export function zonedToUtc(date: string, time: string, tz: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const wall = Date.UTC(+d[1]!, +d[2]! - 1, +d[3]!, +t[1]!, +t[2]!);
  let utc = wall - zoneOffsetMs(wall, tz);
  utc = wall - zoneOffsetMs(utc, tz); // second pass settles daylight-saving edges
  return Number.isFinite(utc) ? new Date(utc).toISOString() : null;
}

/** Stored UTC → { date: "2026-12-05", time: "13:00" } on the wall clock of `tz`. */
export function utcToZoned(iso: string, tz: string): { date: string; time: string } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${String(+p.hour! % 24).padStart(2, "0")}:${p.minute}` };
}
