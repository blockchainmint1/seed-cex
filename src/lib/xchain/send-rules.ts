/**
 * Rules for sending a THORChain or Maya swap from a member's trading pocket (pure, tested).
 *
 * THORChain: every coin Seeds can sign. Maya: only Bitcoin, Ether and Ethereum
 * tokens (USDC/USDT) — the coins Seeds signs that Maya also trades. Either way a
 * route is send-ready only after two independent servers confirm the vault.
 * During the pilot only admins can send, with per-swap and daily dollar caps
 * enforced again inside the database (reserve_swap_send).
 */
import type { PocketCoin } from "@/lib/pockets/coins";
import { hmeWalletCanHold } from "@/lib/pockets/hme-support";
import type { Protocol, SwapCoin } from "./assets";

/** Default protocol (and the one TSD-route coins must be on). */
export const SEND_PROTOCOL: Protocol = "thorchain";
export const SEND_PROTOCOLS: Protocol[] = ["thorchain", "maya"];
/**
 * Coins Seeds may send into Maya during the pilot: Bitcoin (plain OP_RETURN send),
 * Ether and Ethereum USDC/USDT (Maya's router takes the same depositWithExpiry call,
 * checked against its live contract code Nov 19 2026).
 */
export const MAYA_SEND_ASSETS = new Set<string>([
  "BTC.BTC", "ETH.ETH", "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48", "ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7",
]);
/** Pilot switch: until each coin has had a small real-money test, only admins can send. */
export const SEND_PILOT_ADMIN_ONLY = true;
export const SWAP_LIMITS = { perSwapUsd: 250, dailyUsd: 1000 } as const;
/** A quote must have at least this long left when we sign. */
export const MIN_SEND_QUOTE_SECONDS = 120;
/** The fresh quote we sign may be at most this much worse than the one the member saw. */
export const REQUOTE_TOLERANCE = 0.01;

export type SendKind = "btc" | "ltc" | "evm" | "erc20" | "doge" | "bch" | "xrp" | "trx" | "sol";

const NATIVE: Record<string, { pocket: PocketCoin; kind: SendKind }> = {
  "BTC.BTC": { pocket: "BTC", kind: "btc" },
  "LTC.LTC": { pocket: "LTC", kind: "ltc" },
  "ETH.ETH": { pocket: "EVM", kind: "evm" },
  "DOGE.DOGE": { pocket: "DOGE", kind: "doge" },
  "BCH.BCH": { pocket: "BCH", kind: "bch" },
  "XRP.XRP": { pocket: "XRP", kind: "xrp" },
  "TRON.TRX": { pocket: "TRX", kind: "trx" },
  "SOL.SOL": { pocket: "SOL", kind: "sol" },
};

/** Which pocket key pays for this coin into `protocol`, and how — or null when Seeds can't send it there yet. */
export function sendSource(c: SwapCoin, protocol: Protocol = SEND_PROTOCOL): { pocket: PocketCoin; kind: SendKind } | null {
  if (!c.protocols.includes(protocol)) return null;
  const n = NATIVE[c.asset] ?? (c.chain === "ETH" && c.token && /-0X[0-9A-F]{40}$/i.test(c.asset) ? { pocket: "EVM" as PocketCoin, kind: "erc20" as SendKind } : null);
  if (!n) return null;
  if (protocol === "maya" && !MAYA_SEND_ASSETS.has(c.asset)) return null;
  return n;
}

const RECEIVE_BY_CHAIN: Record<string, PocketCoin> = {
  BTC: "BTC", LTC: "LTC", DOGE: "DOGE", BCH: "BCH", XRP: "XRP", TRON: "TRX", SOL: "SOL", ZEC: "ZEC",
  ETH: "EVM", BSC: "EVM", AVAX: "EVM", BASE: "EVM", ARB: "EVM",
};
/** The pocket whose own address can receive this coin ("send it back to my pocket"). */
export function receivePocket(c: SwapCoin): PocketCoin | null {
  return RECEIVE_BY_CHAIN[c.chain] ?? null;
}

/** True when this coin would land in a pocket HME Wallet can't hold (DOGE, SOL, …): members must swap it back to TSD before revoking. */
export function landsOutsideHmeWallet(c: SwapCoin): boolean {
  const p = receivePocket(c);
  return p !== null && !hmeWalletCanHold(p);
}

export function requoteOk(shownOut: number, freshOut: number, tolerance: number = REQUOTE_TOLERANCE): boolean {
  return Number.isFinite(shownOut) && shownOut > 0 && freshOut >= shownOut * (1 - tolerance);
}

export type LinkLike = { mode: string; hasKey: boolean; pockets: string[] } | null;

/** First reason a member can't send this swap right now, or null. */
export function sendBlocker(p: {
  from: SwapCoin;
  link: LinkLike;
  isAdmin: boolean;
  amountUsd: number | null;
  protocol?: Protocol;
}): string | null {
  const protocol = p.protocol ?? SEND_PROTOCOL;
  const src = sendSource(p.from, protocol);
  if (!src) return protocol === "maya" && sendSource(p.from) ? `Seeds sends ${p.from.symbol} through THORChain only for now.` : `Seeds can't send ${p.from.symbol} on ${p.from.network} yet.`;
  if (SEND_PILOT_ADMIN_ONLY && !p.isAdmin) return "Sending is in a small test with the Seeds team first. It opens to members after that.";
  if (!p.link) return "Link your HME Wallet trading pocket first (Profile).";
  if (p.link.mode !== "access" || !p.link.hasKey) return "Your pocket is linked in approve-every-trade mode. Swaps need instant access for now.";
  if (!p.link.pockets.includes(src.pocket)) return `Your linked pocket doesn't include ${p.from.network}.`;
  if (p.amountUsd == null) return "No live price for this coin, so the limit can't be checked.";
  if (p.amountUsd > SWAP_LIMITS.perSwapUsd) return `Swaps are limited to $${SWAP_LIMITS.perSwapUsd} each during the test.`;
  return null;
}

export type ThorTxStatus = {
  out_txs?: Array<{ id?: string; memo?: string; chain?: string }>;
  planned_out_txs?: Array<{ refund?: boolean }>;
  stages?: { outbound_signed?: { completed?: boolean }; inbound_observed?: { completed?: boolean } };
};

/**
 * Map THORNode / MAYANode /tx/status to our row status. With `destChain`, only a
 * payout on that chain counts as delivery: Maya also lists CACAO payouts on its own
 * chain, and a partial fill can show a payout plus a refund of the rest.
 */
export function swapProgress(s: ThorTxStatus | null, destChain?: string): { status: "sent" | "done" | "refunded"; outTxid: string | null } {
  const outs = s?.out_txs ?? [];
  const signed = Boolean(s?.stages?.outbound_signed?.completed);
  const refund = outs.find((o) => /^REFUND/i.test(o.memo ?? ""));
  if (destChain) {
    const out = outs.find((o) => /^OUT/i.test(o.memo ?? "") && (o.chain ?? "").toUpperCase() === destChain.toUpperCase());
    if (out && signed) return { status: "done", outTxid: out.id ?? null };
    if (refund && signed) return { status: "refunded", outTxid: refund.id ?? null };
    return { status: "sent", outTxid: null };
  }
  if (refund && signed) return { status: "refunded", outTxid: refund.id ?? null };
  const out = outs.find((o) => /^OUT/i.test(o.memo ?? ""));
  if (out && signed) return { status: "done", outTxid: out.id ?? null };
  return { status: "sent", outTxid: null };
}

/** Public explorer page for a swap's inbound transaction. */
export function trackerUrl(protocol: string, txid: string): string {
  const id = thorTxId(txid);
  return protocol === "maya" ? `https://www.mayascan.org/tx/${id}` : `https://runescan.io/tx/${id}`;
}

export const TRACKER_NAME: Record<Protocol, string> = { thorchain: "RuneScan", maya: "MayaScan" };

/** THORNode wants EVM hashes without 0x, upper-case. */
export function thorTxId(txid: string): string {
  return txid.replace(/^0x/i, "").toUpperCase();
}

/* --------------------------- outside destinations --------------------------- */

/** Error text the Swap page recognises to show its authenticator-code box. */
export const SWAP_CODE_NEEDED = "Enter the 6-digit code from your authenticator app to send this swap to an outside address.";

/**
 * True when a swap pays out to the member's own linked pocket for that coin.
 * EVM addresses compare without case (checksums); every other chain compares exactly.
 */
export function isOwnPocketDestination(to: SwapCoin, addresses: Partial<Record<string, string>> | null | undefined, destination: string): boolean {
  const pocket = receivePocket(to);
  const own = pocket ? addresses?.[pocket] : undefined;
  if (!own || !destination) return false;
  return pocket === "EVM" ? own.toLowerCase() === destination.trim().toLowerCase() : own === destination.trim();
}

/**
 * Audit 2026-11-19 H2: a swap paying out anywhere except the member's own pocket is a
 * withdrawal, so it needs two-factor on, a code entered in the last 10 minutes, and a
 * verified Telegram chat for the Approve tap. Null when the request may be sent to Telegram.
 */
export function outsideSwapProblem(i: { twoFactorOn: boolean; fresh: boolean; telegramVerified: boolean }): string | null {
  if (!i.twoFactorOn) return "Sending a swap to an outside address needs two-factor sign-in. Turn it on in Account → Security, or send it to your own pocket.";
  if (!i.fresh) return SWAP_CODE_NEEDED;
  if (!i.telegramVerified) return "Connect Telegram (Account → Alerts). A swap to an outside address waits for your Approve tap in Telegram.";
  return null;
}
