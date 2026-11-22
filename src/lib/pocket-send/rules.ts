/**
 * Sending coins from a member's HME trading pocket: pure rules (no I/O).
 *
 * Every send from a pocket — an exchange trade leg or a P2P release — needs:
 *  1. an active instant-access HME Wallet link that holds a key for that pocket,
 *  2. two-factor on before that link was made (same rule as withdrawals),
 *  3. a verified Telegram chat, and
 *  4. a fresh "Approve" tap in that chat for exactly this coin, amount and destination.
 */
import type { LegId } from "@/lib/chains";

/** How long a member has to tap Approve. */
export const APPROVAL_TTL_MS = 15 * 60_000;

export type PocketId = "TXC" | "ISK" | "LTC" | "EVM";

/** Which HME pocket key pays a settlement leg. TSD and the wrapped coins ride on TEXITcoin addresses. */
export function pocketForLeg(leg: LegId): PocketId {
  switch (leg) {
    case "txc":
    case "tsd":
    case "wbtc":
    case "wltc":
    case "weth":
      return "TXC";
    case "isk":
      return "ISK";
    case "ltc":
      return "LTC";
    default:
      return "EVM";
  }
}

export type SendReadiness = {
  link: { mode: string; hasKey: boolean; pocketAddress: string | null } | null;
  /** From withdrawLinkState: two-factor must predate the link. */
  twoFactor: "ready" | "needs_2fa" | "needs_relink" | null;
  telegramVerified: boolean;
};

/**
 * What the send is for. "trade" = an exchange order-book leg paying the matched member:
 * Bobby (Nov 22 2026) — the Telegram tap is enough, no two-factor-before-link rule.
 * Every other pocket send (P2P release, loans, …) keeps the withdrawal rule.
 */
export type PocketSendUse = "send" | "trade";

/** Why this member can't send from their pocket right now, or null when they can. Plain English. */
export function pocketSendBlocker(i: SendReadiness, pocket: PocketId, use: PocketSendUse = "send"): string | null {
  if (!i.link) return "Link your HME Wallet first (Account → Security).";
  if (i.link.mode !== "access") {
    return "Your HME Wallet link is set to approve each trade inside HME Wallet, which Seeds can't do yet. Re-link with instant access to send from Seeds.";
  }
  if (!i.link.hasKey) return "Seeds doesn't hold a key for your pocket. Re-link your HME Wallet with instant access.";
  if (!i.link.pocketAddress) return `Your HME Wallet link doesn't include a ${pocket === "EVM" ? "Ethereum-type" : pocket} pocket. Re-link to add it.`;
  if (use !== "trade" && i.twoFactor !== "ready") {
    return i.twoFactor === "needs_relink"
      ? "Re-link your HME Wallet: two-factor was turned on after this link, and coins only leave your pocket when two-factor came first."
      : "Turn on two-factor sign-in (Account → Security), then re-link your HME Wallet. Coins only leave your pocket when two-factor was on before the link.";
  }
  if (!i.telegramVerified) return "Connect Telegram (Account → Alerts). Every send from your pocket waits for your tap in Telegram.";
  return null;
}

/* ------------------------------ Telegram buttons ------------------------------ */

export type ApprovalChoice = "yes" | "no";
const PREFIX: Record<ApprovalChoice, string> = { yes: "ap1", no: "ap0" };
const CHOICE: Record<string, ApprovalChoice> = { ap1: "yes", ap0: "no" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SIG_LEN = 16; // 96 bits of base64url

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sign(key: string, choice: ApprovalChoice, approvalId: string, userId: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`seeds-send|${choice}|${approvalId}|${userId}`)));
  return b64url(mac).slice(0, SIG_LEN);
}

/** Telegram callback_data for Approve / Decline (≤ 64 bytes). Bound to one request and its owner. */
export async function approvalButtonData(key: string, choice: ApprovalChoice, approvalId: string, userId: string): Promise<string> {
  if (!key || !UUID.test(approvalId)) throw new Error("bad approval button");
  return `${PREFIX[choice]}:${approvalId}:${await sign(key, choice, approvalId, userId)}`;
}

export function parseApprovalData(data: unknown): { choice: ApprovalChoice; approvalId: string; sig: string } | null {
  if (typeof data !== "string" || data.length > 64) return null;
  const [p, approvalId, sig, ...rest] = data.split(":");
  const choice = CHOICE[p];
  if (!choice || rest.length || !UUID.test(approvalId ?? "") || !sig || sig.length !== SIG_LEN) return null;
  return { choice, approvalId, sig };
}

export async function approvalSignatureOk(
  key: string,
  d: { choice: ApprovalChoice; approvalId: string; sig: string },
  userId: string,
): Promise<boolean> {
  if (!key) return false;
  const want = await sign(key, d.choice, d.approvalId, userId);
  let diff = want.length ^ d.sig.length;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ (d.sig.charCodeAt(i) || 0);
  return diff === 0;
}

export type TapDecision = "refuse" | "already_decided" | "expired" | "approve" | "decline";

/** What a tap may do. Only the owner's own verified private chat counts, and only before it expires. */
export function approvalTapDecision(i: {
  choice: ApprovalChoice;
  signatureOk: boolean;
  privateChat: boolean;
  tapChatId: string;
  ownerChatId: string | null;
  ownerChatVerified: boolean;
  status: string;
  expiresAtMs: number;
  nowMs: number;
}): TapDecision {
  if (!i.signatureOk || !i.privateChat || !i.ownerChatVerified || !i.ownerChatId || i.ownerChatId !== i.tapChatId) return "refuse";
  if (i.status !== "pending") return "already_decided";
  if (!(i.expiresAtMs > i.nowMs)) return "expired";
  return i.choice === "yes" ? "approve" : "decline";
}

/* ------------------------------- trade outcome ------------------------------- */

export type LegApproval = { sent: boolean; needsApproval: boolean; status: string | null };

/**
 * Exchange trades are all-or-nothing (audit C2): coins move only once every unsent leg
 * that needs a tap has one. Any decline or expiry cancels the whole trade.
 */
export function tradeApprovalOutcome(legs: LegApproval[]): "send" | "wait" | "cancel" {
  const open = legs.filter((l) => !l.sent && l.needsApproval);
  if (open.some((l) => l.status === "declined" || l.status === "expired" || l.status === "cancelled")) return "cancel";
  if (open.every((l) => l.status === "approved")) return "send";
  return "wait";
}

/** An approval may be spent only for exactly what was approved. */
/**
 * Extra details an approval must also match exactly (audit #3 A5): an outside-address swap
 * binds the receiving coin and the protocol shown in Telegram, not just what's paid and where.
 */
export function approvalMetaMatches(rowMeta: Record<string, unknown> | null | undefined, want: Record<string, string> | undefined): boolean {
  if (!want) return true;
  const m = rowMeta ?? {};
  return Object.entries(want).every(([k, v]) => typeof m[k] === "string" && m[k] === v);
}

export function approvalMatches(
  row: { status: string; expiresAtMs: number; userId: string; linkId: string; leg: string; amount: number; fromAddress: string; toAddress: string },
  want: { userId: string; linkId: string; leg: string; amount: number; fromAddress: string; toAddress: string; nowMs: number },
): boolean {
  return (
    row.status === "approved" &&
    row.expiresAtMs > want.nowMs &&
    row.userId === want.userId &&
    row.linkId === want.linkId &&
    row.leg === want.leg &&
    Math.abs(row.amount - want.amount) <= 1e-8 &&
    row.fromAddress === want.fromAddress &&
    row.toAddress === want.toAddress
  );
}
