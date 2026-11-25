/**
 * Pure, client-safe rules for the HME Wallet trading link (no keys, no I/O).
 * Shared by the submit endpoint, the manifest and the Security tab so the
 * "Add new coins" button and the server agree on what a link holds.
 */
import { POCKET_SPECS, SEEDS_POCKET, accountPath, parseAccountPath, type PocketCoin } from "./pockets/coins";
import { HME_WALLET_CANT_HOLD } from "./pockets/hme-support";

/** Pockets requested from every wallet today (HME Wallet derives these five). */
export const ALLOWED_CHAINS = ["TXC", "ISK", "BTC", "LTC", "EVM"] as const;
/** Pockets Seeds accepts when a wallet chooses to send them (see docs/hme-wallet-extra-pockets.md). */
export const OPTIONAL_CHAINS = ["DOGE", "BCH", "ZEC", "XRP", "TRX", "SOL", "DASH", "ATOM", "RUNE", "ADA", "XMR", "XLM", "TON", "SUI"] as const;
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

/** Paths a link request asks for: always pocket 1106, the only pocket HME Wallet shares with Seeds. */
export function requestAccount(_active: LinkLike | null): number {
  return SEEDS_POCKET;
}

export const ONLY_POCKET_1106 = "Seeds only links pocket 1106. Update HME Wallet and link again; nothing in your wallet moves.";
/** A wallet reporting any pocket other than 1106 is refused (Bobby, Nov 22 2026). */
export function pocketNumberProblem(account: number): string | null {
  return account === SEEDS_POCKET ? null : ONLY_POCKET_1106;
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
export const REFUSE_OTHER_WALLET =
  "This is a different wallet from the one linked to your Seeds account, so nothing was changed. Re-link with the same HME Wallet (same recovery phrase) you linked before. To switch wallets on purpose, move your coins out, revoke on Seeds first, then link the new wallet.";
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
export function replaceProblem(
  active: (LinkLike & { mode?: string; hasKey?: boolean; xpubs?: Record<string, string> }) | null,
  incoming: { account: number; chains: PocketCoin[]; mode?: string; xpubs?: Record<string, string> },
  sameKey: (coin: PocketCoin, stored: string, incoming: string) => boolean = (_coin, a, b) => a === b,
): string | null {
  if (!active) return null;
  if (incoming.account !== active.account) return REFUSE_OTHER_POCKET;
  // A re-link only confirms the same wallet: any coin already linked must come back with the same key.
  if (active.xpubs && incoming.xpubs) {
    for (const c of linkCoins(active)) {
      const a = active.xpubs[c], b = incoming.xpubs[c];
      if (a && b && !sameKey(c, a, b)) return REFUSE_OTHER_WALLET;
    }
  }
  // Audit carry-over: instant access -> approve-each-trade hands Seeds no key, so Seeds would
  // drop its key to coins HME Wallet can't move. That must be a deliberate revoke, not a re-link.
  if (active.mode === "access" && active.hasKey && incoming.mode !== undefined && incoming.mode !== "access") {
    const extra = linkCoins(active).filter((c) => (HME_WALLET_CANT_HOLD as string[]).includes(c));
    if (extra.length) return refuseApproveSwitch(extra);
  }
  const dropped = linkCoins(active).filter((c) => !incoming.chains.includes(c));
  return dropped.length ? refuseDroppedCoins(dropped) : null;
}

export function refuseApproveSwitch(coins: PocketCoin[]): string {
  return `Switching to approve-each-trade would delete Seeds' key to your ${coins.join(", ")} pocket, and HME Wallet can't move those coins. ` +
    "Swap them back to TSD on Seeds first, then revoke Seeds' access (Account → Security) and link again. Nothing was changed.";
}

/** Short member-facing names for a list of pocket coins. */
export function coinNames(coins: PocketCoin[]): string[] {
  return coins.map((c) => (c === "EVM" ? "Ethereum & EVM coins" : c === "TXC" ? "TXC + TSD" : POCKET_SPECS[c].name));
}
