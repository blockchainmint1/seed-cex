/**
 * Monero rules (pure, tested). Seeds reads and sends members' Monero through its own
 * Monero server (monerod + monero-wallet-rpc behind an HTTPS proxy). Watch wallets on that
 * server hold only the member's VIEW key. Sends use cold signing: the watch wallet builds an
 * unsigned set, Seeds reads it back (describe_transfer), and a separate RAM-only signer signs it.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { base58xmr } from "@scure/base";
import { keccak_256 } from "@noble/hashes/sha3.js";

export const XMR_DECIMALS = 12;
/** Never pay more than this in Monero network fees for one send (typical: ~0.00005 XMR). */
export const XMR_MAX_FEE = 0.001;
/** Monero coins can't be spent until 10 blocks deep (~20 minutes). */
export const XMR_CONFIRMATIONS = 10;
/** Seconds per Monero block. */
export const XMR_BLOCK_SECONDS = 120;
/** Extra blocks scanned before the link date (~2 days), so nothing just before linking is missed. */
export const XMR_RESTORE_BUFFER = 1440;

export function xmrToUnits(n: number): bigint {
  if (!Number.isFinite(n) || n < 0) throw new Error("Bad Monero amount");
  return BigInt(Math.round(n * 1e12));
}
export function unitsToXmr(u: bigint | number | string): number {
  return Number(BigInt(u)) / 1e12;
}

/** Wallet file name on the Monero server for a pocket address — never the address itself. */
export function watchWalletName(address: string): string {
  return `seeds-${bytesToHex(sha256(utf8ToBytes(`xmr-watch:${address}`))).slice(0, 32)}`;
}

/** Block height to start scanning from: the link date minus a buffer, never below 0. */
export function restoreHeight(nowHeight: number, linkedAtMs: number, nowMs: number): number {
  const blocksSince = Math.max(0, Math.floor((nowMs - linkedAtMs) / 1000 / XMR_BLOCK_SECONDS));
  return Math.max(0, nowHeight - blocksSince - XMR_RESTORE_BUFFER);
}

/** Mainnet primary (4…), subaddress (8…) or integrated (4…, 106 chars) address, checksum verified. */
export function isMoneroAddress(a: string): boolean {
  const t = a.trim();
  if (!/^[48][1-9A-HJ-NP-Za-km-z]{94}$/.test(t) && !/^4[1-9A-HJ-NP-Za-km-z]{105}$/.test(t)) return false;
  try {
    const raw = base58xmr.decode(t);
    const want = t.length === 106 ? 77 : 69;
    if (raw.length !== want) return false;
    if (![0x12, 0x13, 0x2a].includes(raw[0]!)) return false;
    const body = raw.slice(0, raw.length - 4);
    const sum = keccak_256(body).slice(0, 4);
    return sum.every((v, i) => v === raw[raw.length - 4 + i]);
  } catch {
    return false;
  }
}

export type TransferPreview = { amount: bigint; fee: bigint; destinations: { address: string; amount: bigint }[]; changeAddress?: string; changeAmount?: bigint };

type DescribeReply = { desc?: Array<{ recipients?: Array<{ address?: unknown; amount?: unknown }>; fee?: unknown; change_address?: unknown; change_amount?: unknown }> };

/**
 * Read wallet-rpc's describe_transfer answer for an unsigned set into a preview, or null when it
 * isn't exactly one transaction with well-formed numbers. This is what the signer will actually
 * sign, so the recipient comes from here — never from what Seeds asked for (audit Z2).
 */
export function previewFromDescribe(r: DescribeReply): TransferPreview | null {
  const d = r.desc;
  if (!Array.isArray(d) || d.length !== 1) return null;
  const t = d[0]!;
  const num = (v: unknown): bigint | null => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) || (typeof v === "string" && /^\d+$/.test(v)) ? BigInt(v as never) : null;
  if (!Array.isArray(t.recipients)) return null;
  const destinations: { address: string; amount: bigint }[] = [];
  for (const x of t.recipients) {
    const a = num(x?.amount);
    if (typeof x?.address !== "string" || a == null) return null;
    destinations.push({ address: x.address, amount: a });
  }
  const fee = num(t.fee);
  const changeAmount = num(t.change_amount ?? 0);
  if (fee == null || changeAmount == null) return null;
  const amount = destinations.reduce((s, x) => s + x.amount, 0n);
  return { amount, fee, destinations, changeAddress: typeof t.change_address === "string" ? t.change_address : "", changeAmount };
}

/** Why a built (not yet sent) transfer must be refused, or null. The server's answer is checked, never trusted. */
export function previewProblem(p: TransferPreview, want: { to: string; units: bigint; from?: string }): string | null {
  if (p.destinations.length !== 1) return "The Monero server built a payment to the wrong number of addresses. Nothing was sent.";
  const d = p.destinations[0]!;
  if (d.address !== want.to) return "The Monero server built a payment to a different address. Nothing was sent.";
  if (d.amount !== want.units || p.amount !== want.units) return "The Monero server built a payment for a different amount. Nothing was sent.";
  if (want.from !== undefined && (p.changeAmount ?? 0n) > 0n && p.changeAddress !== want.from) return "The Monero server built a payment whose change goes somewhere else. Nothing was sent.";
  if (p.fee <= 0n) return "The Monero server didn't report a network fee. Nothing was sent.";
  if (unitsToXmr(p.fee) > XMR_MAX_FEE) return "Monero network fees are unusually high right now. Nothing was sent — ask again later.";
  return null;
}

/** Balance shown to the member: only unlocked coins count; the rest is the grey "arriving" note. */
export function displayBalance(balance: bigint, unlocked: bigint): { balance: number; arriving: number } {
  const locked = balance > unlocked ? balance - unlocked : 0n;
  return { balance: unitsToXmr(unlocked), arriving: unitsToXmr(locked) };
}

/** The server is usable only when both its address and its access token are set. */
export function moneroConfigured(env: { url?: string | undefined; token?: string | undefined }): boolean {
  return Boolean(env.url?.startsWith("https://") && env.token && env.token.length >= 24);
}
