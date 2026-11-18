/**
 * Pure, client-safe rules for the HME Wallet trading link (no keys, no I/O).
 * Shared by the submit endpoint, the manifest and the Security tab so the
 * "Add new coins" button and the server agree on what a link holds.
 */
import { POCKET_SPECS, accountPath, parseAccountPath, type PocketCoin } from "./pockets/coins";

/** Pockets requested from every wallet today (HME Wallet derives these five). */
export const ALLOWED_CHAINS = ["TXC", "ISK", "BTC", "LTC", "EVM"] as const;
/** Pockets Seeds accepts when a wallet chooses to send them (see docs/hme-wallet-extra-pockets.md). */
export const OPTIONAL_CHAINS = ["DOGE", "BCH", "ZEC", "XRP", "TRX", "SOL", "DASH", "ATOM", "RUNE", "ADA", "XMR"] as const;
export const ACCEPTED_CHAINS = [...ALLOWED_CHAINS, ...OPTIONAL_CHAINS] as const;

export type LinkLike = { account: number; paths: string[] };

/** Coins a stored link covers (paths on another pocket number are ignored). */
export function linkCoins(link: LinkLike): PocketCoin[] {
  const out: PocketCoin[] = [];
  for (const p of link.paths) {
    const r = parseAccountPath(p);
    if (r && r.account === link.account && !out.includes(r.coin)) out.push(r.coin);
  }
  return out;
}

/** Coins Seeds now asks for that the member's active link doesn't hold yet. */
export function coinsToAdd(link: LinkLike): PocketCoin[] {
  const have = linkCoins(link);
  return ACCEPTED_CHAINS.filter((c) => !have.includes(c));
}

/** Paths a new link request asks for: the active link's pocket when there is one, else the first pocket (1106). */
export function requestAccount(active: LinkLike | null): number {
  return active?.account ?? 1106;
}
export function requestPaths(active: LinkLike | null): { core: Record<string, string>; optional: Record<string, string> } {
  const n = requestAccount(active);
  return {
    core: Object.fromEntries(ALLOWED_CHAINS.map((c) => [c, accountPath(c, n)])),
    optional: Object.fromEntries(OPTIONAL_CHAINS.map((c) => [c, accountPath(c, n)])),
  };
}

export const REFUSE_OTHER_POCKET =
  "You already have a Seeds link on a different Trading pocket. Revoke your current link on Seeds (Account → Security) first, then link again.";
export function refuseDroppedCoins(coins: PocketCoin[]): string {
  return `This wallet version can't share all the coins your Seeds link already covers (missing ${coins.join(", ")}). ` +
    "Update HME Wallet and try again, or move those coins out on Seeds first. Nothing was changed.";
}

/**
 * Whether a new link may replace the member's active one. Refuses a different
 * pocket number (Seeds would lose the keys to coins still in the old pocket)
 * and any link that leaves out a coin the active link holds (an older wallet
 * or approve-every-trade would otherwise wipe keys to coins HME Wallet can't move).
 */
export function replaceProblem(active: LinkLike | null, incoming: { account: number; chains: PocketCoin[] }): string | null {
  if (!active) return null;
  if (incoming.account !== active.account) return REFUSE_OTHER_POCKET;
  const dropped = linkCoins(active).filter((c) => !incoming.chains.includes(c));
  return dropped.length ? refuseDroppedCoins(dropped) : null;
}

/** Short member-facing names for a list of pocket coins. */
export function coinNames(coins: PocketCoin[]): string[] {
  return coins.map((c) => (c === "EVM" ? "Ethereum & EVM coins" : c === "TXC" ? "TXC + TSD" : POCKET_SPECS[c].name));
}
