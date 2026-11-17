/**
 * Trading-pocket key families — one per signing scheme, not per market.
 *
 * Client-safe: names and derivation paths only. A "pocket" is the account
 * branch m/purpose'/coin'/N' (N = 1106..2105, the wallet decides), so the
 * person's savings branch (account 0) is never part of anything Seeds holds.
 * EVM covers every EVM network (Ethereum, BNB Chain, Base) with one key.
 */

export const POCKET_COINS = [
  "TXC", "ISK", "BTC", "LTC", "EVM", "DOGE", "BCH", "ZEC", "XRP", "TRX", "SOL",
] as const;
export type PocketCoin = (typeof POCKET_COINS)[number];

export type PocketSpec = {
  id: PocketCoin;
  name: string;
  curve: "secp256k1" | "ed25519";
  purpose: 44 | 84;
  coinType: number;
  /** Markets / swap coins this one key pays for. */
  covers: string[];
  /** HME Wallet already derives and sends this pocket today. */
  hmeToday: boolean;
  /** Seeds can build and sign a send from this pocket. */
  signing: "ready" | "planned";
};

export const POCKET_SPECS: Record<PocketCoin, PocketSpec> = {
  TXC: { id: "TXC", name: "TEXITcoin", curve: "secp256k1", purpose: 44, coinType: 696969, covers: ["TXC", "TSD", "wBTC", "wLTC", "wETH"], hmeToday: true, signing: "ready" },
  ISK: { id: "ISK", name: "ISK", curve: "secp256k1", purpose: 44, coinType: 969696, covers: ["ISK"], hmeToday: true, signing: "ready" },
  BTC: { id: "BTC", name: "Bitcoin", curve: "secp256k1", purpose: 84, coinType: 0, covers: ["BTC"], hmeToday: true, signing: "ready" },
  LTC: { id: "LTC", name: "Litecoin", curve: "secp256k1", purpose: 44, coinType: 2, covers: ["LTC"], hmeToday: true, signing: "ready" },
  EVM: { id: "EVM", name: "Ethereum / BNB Chain / Base", curve: "secp256k1", purpose: 44, coinType: 60, covers: ["ETH", "BNB", "USDC", "USDT"], hmeToday: true, signing: "ready" },
  DOGE: { id: "DOGE", name: "Dogecoin", curve: "secp256k1", purpose: 44, coinType: 3, covers: ["DOGE"], hmeToday: false, signing: "ready" },
  BCH: { id: "BCH", name: "Bitcoin Cash", curve: "secp256k1", purpose: 44, coinType: 145, covers: ["BCH"], hmeToday: false, signing: "ready" },
  ZEC: { id: "ZEC", name: "Zcash (transparent)", curve: "secp256k1", purpose: 44, coinType: 133, covers: ["ZEC"], hmeToday: false, signing: "planned" },
  XRP: { id: "XRP", name: "XRP Ledger", curve: "secp256k1", purpose: 44, coinType: 144, covers: ["XRP"], hmeToday: false, signing: "ready" },
  TRX: { id: "TRX", name: "TRON", curve: "secp256k1", purpose: 44, coinType: 195, covers: ["TRX"], hmeToday: false, signing: "ready" },
  SOL: { id: "SOL", name: "Solana", curve: "ed25519", purpose: 44, coinType: 501, covers: ["SOL"], hmeToday: false, signing: "ready" },
};

export const FIRST_POCKET = 1106;
export const LAST_POCKET = 2105;

export function validPocket(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= FIRST_POCKET && (n as number) <= LAST_POCKET;
}

/** Account-level path. Solana (SLIP-0010) is hardened-only, so its key lives one level deeper. */
export function accountPath(coin: PocketCoin, account: number): string {
  const s = POCKET_SPECS[coin];
  const base = `m/${s.purpose}'/${s.coinType}'/${account}'`;
  return coin === "SOL" ? `${base}/0'` : base;
}

/** Path of the pocket's receive address (child 0/0 for secp256k1 coins). */
export function receivePath(coin: PocketCoin, account: number): string {
  return coin === "SOL" ? accountPath(coin, account) : `${accountPath(coin, account)}/0/0`;
}

/** Inverse of accountPath: which pocket coin and account a wallet-submitted path names. */
export function parseAccountPath(path: string): { coin: PocketCoin; account: number } | null {
  for (const coin of POCKET_COINS) {
    const s = POCKET_SPECS[coin];
    const tail = coin === "SOL" ? "\\/0'" : "";
    const m = new RegExp(`^m\\/${s.purpose}'\\/${s.coinType}'\\/(\\d+)'${tail}$`).exec(path);
    if (m) return { coin, account: Number(m[1]) };
  }
  return null;
}
