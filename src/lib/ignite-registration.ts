// Pure rules for the Ignite registration flow. Prices shown here are display-only;
// any live checkout must take the amount from the server, never from the client.
export const SEAT_CAPACITY = 100;
export const DEPOSIT_USD = 400;

export type Details = { fullName: string; email: string; countryCode: string; phone: string; marketingOptIn: boolean };
export type Errors = Partial<Record<"fullName" | "email" | "phone" | "countryCode", string>>;

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export function validateDetails(d: Details): Errors {
  const errors: Errors = {};
  const name = d.fullName.trim();
  if (name.length < 2) errors.fullName = "Enter your full name.";
  else if (name.length > 100) errors.fullName = "Name must be under 100 characters.";
  const email = normalizeEmail(d.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 255) errors.email = "Enter a valid email address.";
  if (!/^\+\d{1,4}$/.test(d.countryCode)) errors.countryCode = "Choose a country code.";
  const digits = d.phone.replace(/[\s\-().]/g, "");
  if (!/^\d{6,14}$/.test(digits)) errors.phone = "Enter a valid phone number (digits only, 6–14).";
  return errors;
}

// Confirmed event schedule (Cory). 5:00 PM CST = 23:00 UTC.
export const SCHEDULE_DATES = "November 30–December 4, 2026";
export const SCHEDULE_SESSIONS = "Five days · 90 minutes per session";
export const SCHEDULE_TIME = "Daily from 5:00–6:30 PM CST";
export const RECORDING_NOTE = "*Sessions will be recorded.";
export const SCHEDULE_START_UTC = "2026-11-30T23:00:00Z";
export const SCHEDULE_END_UTC = "2026-12-05T00:30:00Z";

// ---- Payment confirmation + referral rules (pure, tested) ----

/** HME referral/affiliate codes: letters, digits, dot, dash, underscore; max 64. */
export const REF_CODE_RE = /^[A-Za-z0-9_.-]{1,64}$/;
export function cleanRefCode(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return REF_CODE_RE.test(s) ? s : null;
}

/** Seats still open, never negative. `held` = confirmed + live checkouts. */
export function seatsLeft(held: number, capacity = SEAT_CAPACITY) {
  return Math.max(0, capacity - Math.max(0, held));
}

/**
 * Member's personal invite link. honest.money/r/{code}?to= counts the click for
 * the referrer and forwards to the Seeds registration page with ?ref={code}.
 */
export function referralUrl(code: string, site = "https://seeds.honest.money") {
  return `https://honest.money/r/${encodeURIComponent(code)}?to=${encodeURIComponent(`${site}/ignite`)}`;
}

/**
 * Short, shareable invite link shown to members: seeds.honest.money/invite/{code}.
 * That page forwards to referralUrl(code) so Honest.Money still counts the click.
 */
export function inviteUrl(code: string, site = "https://seeds.honest.money") {
  return `${site}/invite/${encodeURIComponent(code)}`;
}

/** The invite link as people read it: no https://, no trailing slash. */
export function inviteLabel(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** NectarPay invoice says paid in full: confirmed/overpaid and at least the deposit. */
export function invoiceSettled(inv: { status: string; fiat_amount: number | string }, amountUsd: number | string) {
  return ["confirmed", "overpaid"].includes(inv.status) && Number(inv.fiat_amount) >= Number(amountUsd);
}

/** The invoice was opened by Seeds for this seat: `ignite-<registration>` or `ignite-peer-<link>`. */
export function invoiceBelongs(orderId: string | null | undefined, registrationId: string, peerLinkId: string | null) {
  if (!orderId) return false;
  return orderId === `ignite-${registrationId}` || (!!peerLinkId && orderId === `ignite-peer-${peerLinkId}`);
}

/**
 * How the payment reads to a member: "TSD on TXC" when the asset is known and
 * differs from the chain, "TXC" for a native payment, or the chain alone when the
 * asset couldn't be read. Null when neither is known.
 */
export function paidInLabel(asset: string | null | undefined, chain: string | null | undefined): string | null {
  const a = asset?.trim();
  const c = chain?.trim().toUpperCase();
  if (a && c && a.toUpperCase() !== c) return `${a} on ${c}`;
  return a ?? c ?? null;
}

// ---- Seat status rules (pure, tested) ----

/** Only these seats may be moved to "confirmed" by a payment. A cancelled (refunded) seat never comes back by itself. */
export const CONFIRMABLE_STATUSES = ["pending", "underpaid", "expired"] as const;
export const canConfirmSeat = (status: string) => (CONFIRMABLE_STATUSES as readonly string[]).includes(status);
/** An operator may cancel any seat that isn't already cancelled (e.g. a test or a refund). */
export const canCancelSeat = (status: string) => status !== "canceled";

// ---- Homepage Ignite popup (pure, tested) ----

/** After "Maybe later" or the close button, the popup stays away this long. */
export const PROMO_SNOOZE_MS = 3 * 24 * 3600_000;

/**
 * Whether the homepage Ignite popup may open. Never once the class has
 * started, never when every seat is held, never for someone whose seat is
 * already paid, and not again for 3 days after they closed it.
 */
export function shouldShowIgnitePromo(o: {
  now: number;
  dismissedAt: number | null;
  seatsLeft: number | null;
  myStatus?: string | null;
  startUtc?: string;
}) {
  if (o.now >= new Date(o.startUtc ?? SCHEDULE_START_UTC).getTime()) return false;
  if (o.dismissedAt != null && o.now - o.dismissedAt < PROMO_SNOOZE_MS) return false;
  if (o.seatsLeft != null && o.seatsLeft <= 0) return false;
  if (o.myStatus === "confirmed") return false;
  return true;
}
