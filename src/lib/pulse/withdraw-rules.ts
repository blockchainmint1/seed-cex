/**
 * Rules for Seeds-signed PulseChain withdrawals (pure, tested).
 *
 * HME Wallet holds the member's EVM pocket key but can't send on PulseChain,
 * so Seeds signs PLS and pHEX withdrawals from an instant-access pocket — only
 * to an address the member typed, only after a hold they can cancel, and within
 * dollar caps enforced again inside the database (reserve_pocket_withdrawal).
 * This is the only place Seeds sends a member's coins to an outside address.
 */
import { HEX_CONTRACT } from "@/lib/chains";

export const PULSE_CHAIN_ID = 369;
export type PulseCoin = "PLS" | "pHEX";
export const PULSE_COINS: Record<PulseCoin, { contract: string | null; decimals: number; name: string }> = {
  PLS: { contract: null, decimals: 18, name: "PLS" },
  pHEX: { contract: HEX_CONTRACT, decimals: 8, name: "HEX on PulseChain" },
};
export function isPulseCoin(c: unknown): c is PulseCoin {
  return c === "PLS" || c === "pHEX";
}

/** Pilot switch: until the first small real-money withdrawals pass, only admins can use this. */
export const PULSE_WITHDRAW_PILOT_ADMIN_ONLY = true;
/**
 * Dollar caps and the wait before sending come from the member's withdrawal
 * level (src/lib/withdraw-limits.ts, edited in /admin/settings). Only the
 * number of withdrawals waiting at once is fixed here.
 */
export const PULSE_MAX_WAITING = 3;
/** Never pay more than this in network fees for one withdrawal (normally well under 100 PLS). */
export const PULSE_MAX_FEE_PLS = 5000;
/** PLS that must stay behind for the network fee (a transfer is ~25–100 PLS, a fraction of a cent). */
export const PULSE_MIN_GAS_PLS = 500;

export type PulseLinkLike = { mode: string; hasKey: boolean; hasEvm: boolean } | null;

/** First reason Seeds can't send PulseChain coins for this member at all, or null. */
export function pulseSendBlocker(p: { link: PulseLinkLike; isAdmin: boolean }): string | null {
  if (PULSE_WITHDRAW_PILOT_ADMIN_ONLY && !p.isAdmin) return "PulseChain withdrawals are open to beta testers first. They open to members after that.";
  if (!p.link) return "Link your HME Wallet trading pocket first (Security tab).";
  if (p.link.mode !== "access" || !p.link.hasKey) return "Your pocket is linked in approve-every-trade mode. Seeds needs instant access to send PulseChain coins for you.";
  if (!p.link.hasEvm) return "Your linked pocket doesn't include an EVM address.";
  return null;
}

/** Exact base units from a typed amount, or null when it isn't a clean positive number. */
export function parseUnits(amount: string, decimals: number): bigint | null {
  const t = amount.trim();
  const m = /^(\d{1,30})(?:\.(\d+))?$/.exec(t);
  if (!m) return null;
  const frac = m[2] ?? "";
  if (frac.length > decimals) return null;
  const units = BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
  return units > 0n ? units : null;
}

export function unitsToNumber(units: bigint, decimals: number): number {
  const base = 10n ** BigInt(decimals);
  return Number(units / base) + Number(units % base) / Number(base);
}

/** Why this destination is unsafe, or null. */
export function destinationProblem(to: string, ownAddress: string | null): string | null {
  const t = to.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(t)) return "That isn't a PulseChain address. It should start with 0x and have 40 more letters/numbers.";
  if (/^0x0{40}$/i.test(t)) return "That's the empty (burn) address — coins sent there are gone.";
  if (t.toLowerCase() === HEX_CONTRACT.toLowerCase()) return "That's the HEX contract itself. Coins sent there can't be recovered.";
  if (ownAddress && t.toLowerCase() === ownAddress.toLowerCase()) return "That's your trading pocket's own address.";
  return null;
}

/** First reason this particular withdrawal can't be requested, or null. */
export function withdrawalProblem(p: {
  coin: PulseCoin;
  units: bigint | null;
  balanceUnits: bigint | null;
  plsBalanceWei: bigint | null;
  amountUsd: number | null;
  perWithdrawalUsd: number;
}): string | null {
  const d = PULSE_COINS[p.coin].decimals;
  if (p.units == null) return `Enter an amount with at most ${d} decimal places.`;
  if (p.balanceUnits == null || p.plsBalanceWei == null) return "PulseChain couldn't be read right now. Try again in a minute.";
  if (p.units > p.balanceUnits) return `Your pocket holds ${unitsToNumber(p.balanceUnits, d)} ${p.coin}.`;
  const gasWei = BigInt(PULSE_MIN_GAS_PLS) * 10n ** 18n;
  if (p.coin === "PLS" && p.units + gasWei > p.balanceUnits) return `Leave at least ${PULSE_MIN_GAS_PLS} PLS behind for the network fee.`;
  if (p.coin === "pHEX" && p.plsBalanceWei < gasWei) return `Keep at least ${PULSE_MIN_GAS_PLS} PLS in your pocket to pay the network fee.`;
  if (p.amountUsd == null) return "No live price for this coin right now, so the limit can't be checked.";
  if (p.amountUsd > p.perWithdrawalUsd) return `Your withdrawal level allows up to $${p.perWithdrawalUsd.toLocaleString("en-US")} per withdrawal.`;
  return null;
}

/** Network fee cap in wei for a gas limit and max fee per gas. */
export function feeTooHigh(gasLimit: bigint, maxFeePerGas: bigint): boolean {
  return gasLimit * maxFeePerGas > BigInt(PULSE_MAX_FEE_PLS) * 10n ** 18n;
}

/** Plain-English status for the member. */
export const WITHDRAW_STATUS: Record<string, string> = {
  held: "Waiting (you can cancel)",
  signing: "Sending",
  sent: "Sent, confirming",
  confirmed: "Done",
  cancelled: "Cancelled",
  failed: "Not sent",
  unknown: "Checking by hand",
};

/** PulseChain confirmations before a withdrawal counts as done. */
export const PULSE_CONFIRMATIONS = 12;
