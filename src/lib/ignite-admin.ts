/**
 * Pure rules for the /admin/ignite registrant desk (no I/O, tested): who can
 * get a payment reminder, how often, what an admin message may contain, and
 * how the table searches and sorts.
 */
export const REMINDER_COOLDOWN_HOURS = 12;
export const MAX_RECIPIENTS = 150;
export const SUBJECT_MAX = 120;
export const BODY_MAX = 4000;

/** Seats that still owe the deposit. Confirmed and cancelled seats never get a payment reminder. */
export const REMINDABLE = ["pending", "underpaid", "expired"] as const;

/**
 * Why an admin can't hide this sign-up from the Registrants list, or null when they can.
 * Hiding only tidies the list: nothing is deleted, and paid or open-checkout seats always stay visible.
 */
export function hideBlock(status: string, invoiceExpiresAt: string | null, now = Date.now()): string | null {
  if (status !== "pending" && status !== "canceled") return "Only unpaid or cancelled sign-ups can be hidden.";
  if (status === "pending" && invoiceExpiresAt && Date.parse(invoiceExpiresAt) > now) return "They have a checkout open right now.";
  return null;
}

/** Why a payment reminder can't go out right now, or null when it can. */
export function reminderBlock(status: string, lastReminderAt: string | null, now = Date.now()): string | null {
  if (status === "confirmed") return "Already paid.";
  if (status === "canceled") return "Seat was cancelled.";
  if (!(REMINDABLE as readonly string[]).includes(status)) return "This seat can't get a payment link.";
  if (lastReminderAt) {
    const next = new Date(lastReminderAt).getTime() + REMINDER_COOLDOWN_HOURS * 3_600_000;
    if (next > now) {
      const h = Math.max(1, Math.ceil((next - now) / 3_600_000));
      return `Reminder sent recently. You can send another in about ${h} hour${h === 1 ? "" : "s"}.`;
    }
  }
  return null;
}

export function validateMessage(m: { subject: string; body: string }): { subject?: string; body?: string } {
  const e: { subject?: string; body?: string } = {};
  const s = m.subject.trim();
  const b = m.body.trim();
  if (s.length < 3) e.subject = "Add a subject.";
  else if (s.length > SUBJECT_MAX) e.subject = `Keep the subject under ${SUBJECT_MAX} characters.`;
  if (b.length < 10) e.body = "Write a short message.";
  else if (b.length > BODY_MAX) e.body = `Keep the message under ${BODY_MAX.toLocaleString("en-US")} characters.`;
  return e;
}

/** Splits a message into paragraphs for the email (blank lines separate them). */
export function paragraphs(body: string): string[] {
  return body.trim().split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

/** "Hi {first}" replacement so one message can greet each person by name. */
export function personalize(text: string, fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] || "there";
  return text.replace(/\{first\}/gi, first);
}

export type IgniteRowLike = {
  fullName: string; email: string; phone: string; status: string; refCode: string | null;
  payerName: string | null; createdAt: string; paidUsd: number | null; lastEmailedAt: string | null;
};
export type SortKey = "fullName" | "email" | "status" | "paidUsd" | "refCode" | "createdAt" | "lastEmailedAt";

const STATUS_ORDER: Record<string, number> = { confirmed: 0, underpaid: 1, pending: 2, expired: 3, canceled: 4 };

export function filterIgniteRows<T extends IgniteRowLike>(rows: T[], q: string, status: string): T[] {
  const s = q.trim().toLowerCase();
  return rows.filter((r) => {
    if (status !== "all" && (status === "unpaid" ? !(REMINDABLE as readonly string[]).includes(r.status) : r.status !== status)) return false;
    if (!s) return true;
    return [r.fullName, r.email, r.phone, r.refCode ?? "", r.payerName ?? ""].some((v) => v.toLowerCase().includes(s));
  });
}

/** Stable sort; empty values always sink to the bottom whichever way you sort. */
export function sortIgniteRows<T extends IgniteRowLike>(rows: T[], key: SortKey, dir: "asc" | "desc"): T[] {
  const sign = dir === "asc" ? 1 : -1;
  const val = (r: T): string | number | null => {
    if (key === "status") return STATUS_ORDER[r.status] ?? 9;
    if (key === "paidUsd") return r.paidUsd;
    if (key === "createdAt" || key === "lastEmailedAt") return r[key] ? new Date(r[key] as string).getTime() : null;
    const v = r[key];
    return v ? String(v).toLowerCase() : null;
  };
  return rows.map((r, i) => ({ r, i, v: val(r) })).sort((a, b) => {
    if (a.v === null && b.v === null) return a.i - b.i;
    if (a.v === null) return 1;
    if (b.v === null) return -1;
    if (a.v < b.v) return -sign;
    if (a.v > b.v) return sign;
    return a.i - b.i;
  }).map((x) => x.r);
}
