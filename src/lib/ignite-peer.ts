// Pure Peer Pay rules for Ignite seats. A registrant shares a private link; a
// signed-in Honest.Money member pays the deposit for them. No discount.
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export const PEER_LINK_DAYS = 7;
export const PEER_EMAILS_PER_DAY = 3;
export const PEER_TOKEN_RE = /^[0-9a-f]{64}$/;
const DAY_MS = 86_400_000;

export const peerLinkExpiry = (from: Date) => new Date(from.getTime() + PEER_LINK_DAYS * DAY_MS);

const enc = new TextEncoder();
/** The link code is derived from the link id with a server secret, so a database copy alone can't rebuild links. */
export const peerToken = (secret: string, linkId: string) => bytesToHex(hmac(sha256, enc.encode(secret), enc.encode(`seeds-peer-pay:${linkId}`)));
/** Only this fingerprint is stored. */
export const peerTokenHash = (token: string) => bytesToHex(sha256(enc.encode(`seeds-peer-pay-hash:${token}`)));

export type PeerState = "active" | "expired" | "cancelled" | "replaced" | "paid";
export function peerLinkState(link: { status: string; expires_at: string }, now = Date.now()): PeerState {
  if (link.status === "paid" || link.status === "paid_duplicate") return "paid";
  if (link.status === "cancelled") return "cancelled";
  if (link.status === "replaced") return "replaced";
  return new Date(link.expires_at).getTime() <= now ? "expired" : "active";
}

/** "Bobby Smith" -> "Bobby S." for the public pay page. */
export function shortName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "A Seeds member";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export const emailsLeft = (sentInLastDay: number) => Math.max(0, PEER_EMAILS_PER_DAY - sentInLastDay);

/** A checkout is "live" if its invoice can still be paid for more than a minute. */
export const invoiceLive = (expiresAt: string | null | undefined, now = Date.now()) => !!expiresAt && new Date(expiresAt).getTime() > now + 60_000;

/** Why a payer can't open checkout on this link right now (null = allowed). */
export function peerCheckoutBlock(i: {
  link: { status: string; expires_at: string; registrant_id: string; payer_id: string | null };
  reg: { status: string; payment_method: string; invoice_expires_at: string | null };
  payerId: string;
  payerHmeLinked: boolean;
  registrantFirstName: string;
  now?: number;
}): string | null {
  const now = i.now ?? Date.now();
  const state = peerLinkState(i.link, now);
  if (state === "paid" || i.reg.status === "confirmed") return "This seat is already paid.";
  if (state !== "active") return `This link is no longer active. Ask ${i.registrantFirstName} for a new one.`;
  if (i.payerId === i.link.registrant_id) return "This is your own Peer Pay link. Share it with the person paying, or pay from the registration page.";
  if (!i.payerHmeLinked) return "Sign in with your Honest.Money account to pay.";
  if (i.reg.status === "underpaid") return `A payment for this seat arrived short. ${i.registrantFirstName} needs to contact help before anyone pays again.`;
  if (invoiceLive(i.reg.invoice_expires_at, now)) {
    if (i.reg.payment_method !== "peer") return `${i.registrantFirstName} has their own checkout open right now. Try again in about an hour.`;
    if (i.link.payer_id && i.link.payer_id !== i.payerId) return "Someone else is paying for this seat right now. Try again in about an hour.";
  }
  return null;
}

/** Why the registrant can't open their own checkout (null = allowed). */
export function selfCheckoutBlock(i: { hasActivePeerLink: boolean; reg: { payment_method: string; invoice_expires_at: string | null } | null; now?: number }): string | null {
  if (i.reg && i.reg.payment_method === "peer" && invoiceLive(i.reg.invoice_expires_at, i.now)) return "Your friend has a Peer Pay checkout open. Wait for it to finish or expire before paying yourself.";
  if (i.hasActivePeerLink) return "Cancel your Peer Pay link before paying yourself, so your seat isn't paid twice.";
  return null;
}

/** Hosts a Peer Pay link may point at (deep scan D1): Seeds' own addresses only, never a look-alike. */
export { SEEDS_ORIGINS as PEER_ORIGINS, safeOrigin } from "./safe-origin";
