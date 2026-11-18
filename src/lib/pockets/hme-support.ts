/**
 * What HME Wallet itself can hold and move back — client-safe, pure.
 *
 * HME Wallet hands Seeds trading-pocket keys for extra coins (DOGE, BCH, ZEC,
 * XRP, TRX, SOL) that the wallet cannot show, send or sweep. Once a member
 * revokes, Seeds deletes its key too, so anything left in those pockets can
 * only be recovered by importing the recovery phrase into another wallet at
 * the pocket path. Every warning about that comes from this file.
 */
import { POCKET_SPECS, receivePath, type PocketCoin } from "./coins";

/** Pocket coins HME Wallet can't hold or move back (HME side: delegate-keys.ts). */
export const HME_WALLET_CANT_HOLD: PocketCoin[] = (Object.values(POCKET_SPECS))
  .filter((s) => !s.hmeToday)
  .map((s) => s.id);

export function hmeWalletCanHold(pocket: PocketCoin | null | undefined): boolean {
  return Boolean(pocket) && POCKET_SPECS[pocket as PocketCoin]?.hmeToday === true;
}

export type PocketBalance = { coin: string; balance: number | null };

/**
 * Before a revoke: which coins HME Wallet can't take back still hold funds
 * (`stranded`), and which couldn't be read (`unknown`). Empty pockets pass.
 */
export function revokeCheck(rows: PocketBalance[]): { stranded: { coin: string; balance: number }[]; unknown: string[] } {
  const stranded: { coin: string; balance: number }[] = [];
  const unknown: string[] = [];
  for (const r of rows) {
    if (!(HME_WALLET_CANT_HOLD as string[]).includes(r.coin)) continue;
    if (r.balance === null || !Number.isFinite(r.balance)) unknown.push(r.coin);
    else if (r.balance > 0) stranded.push({ coin: r.coin, balance: r.balance });
  }
  return { stranded, unknown };
}

/** "DOGE, BCH and SOL" */
export function listCoins(coins: string[]): string {
  if (coins.length <= 1) return coins.join("");
  return `${coins.slice(0, -1).join(", ")} and ${coins[coins.length - 1]}`;
}

/** Member-facing warning for the coins a link includes that HME Wallet can't hold. */
export function hmeCantHoldWarning(coins: string[]): string | null {
  const extra = coins.filter((c) => (HME_WALLET_CANT_HOLD as string[]).includes(c));
  if (!extra.length) return null;
  return `HME Wallet can't hold ${listCoins(extra)}. Swap them back to TSD on Seeds before you revoke access — in HME Wallet or here. ` +
    "After a revoke Seeds deletes its key, so it can't swap them for you any more.";
}

/**
 * Recovery lines for a revoke email: where each extra coin lived, by address
 * and path, so a member who left funds there can recover them with their
 * recovery phrase in a wallet that supports that coin.
 */
export function recoveryLines(account: number, addresses: Partial<Record<string, string>>): string[] {
  return HME_WALLET_CANT_HOLD
    .filter((c) => addresses[c])
    .map((c) => {
      const note = POCKET_SPECS[c].recoveryNote;
      return `${c} (${POCKET_SPECS[c].name}): ${addresses[c]} — ${note ? `${note} ${account}` : `recovery path ${receivePath(c, account)}`}`;
    });
}
