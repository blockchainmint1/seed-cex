/**
 * Trading-pocket key families — one per signing scheme, not per market.
 *
 * Client-safe: names and derivation paths only. A "pocket" is the account
 * branch m/purpose'/coin'/N' (Seeds always uses N = 1106, SEEDS_POCKET), so the
 * person's savings branch (account 0) is never part of anything Seeds holds.
 * EVM covers every EVM network (Ethereum, BNB Chain, Base) with one key.
 *
 * Adding a coin here is the first step of the chain-onboarding checklist in
 * docs/hme-wallet-extra-pockets.md: spec + key format + test vectors, then
 * list it in the link manifest. HME Wallet skips optional coins it doesn't
 * know yet, so neither side has to ship on the same day.
 */

export const POCKET_COINS = [
  "TXC", "ISK", "BTC", "LTC", "EVM", "DOGE", "BCH", "ZEC", "XRP", "TRX", "SOL",
  "DASH", "ATOM", "RUNE", "ADA", "XMR",
] as const;
export type PocketCoin = (typeof POCKET_COINS)[number];

export type PocketSpec = {
  id: PocketCoin;
  name: string;
  /**
   * secp256k1 = BIP32 xpub/xprv · ed25519 = SLIP-0010 raw key (hardened only)
   * · ed25519-bip32 = Cardano CIP-1852 Icarus extended key.
   */
  curve: "secp256k1" | "ed25519" | "ed25519-bip32";
  purpose: 44 | 84 | 1852;
  coinType: number;
  /** Markets / swap coins this one key pays for. */
  covers: string[];
  /** HME Wallet already derives and sends this pocket today. */
  hmeToday: boolean;
  /** Seeds can build and sign a send from this pocket. */
  signing: "ready" | "planned";
  /** Seeds can read this pocket's balance from public servers (Monero needs a view-key scan, so no). */
  balanceReadable: boolean;
  /** How a member restores this pocket elsewhere after a revoke, when it isn't simply "BIP44 path". */
  recoveryNote?: string;
};

export const POCKET_SPECS: Record<PocketCoin, PocketSpec> = {
  TXC: { id: "TXC", name: "TEXITcoin", curve: "secp256k1", purpose: 44, coinType: 696969, covers: ["TXC", "TSD", "wBTC", "wLTC", "wETH"], hmeToday: true, signing: "ready", balanceReadable: true },
  ISK: { id: "ISK", name: "ISK", curve: "secp256k1", purpose: 44, coinType: 969696, covers: ["ISK"], hmeToday: true, signing: "ready", balanceReadable: true },
  BTC: { id: "BTC", name: "Bitcoin", curve: "secp256k1", purpose: 84, coinType: 0, covers: ["BTC"], hmeToday: true, signing: "ready", balanceReadable: true },
  LTC: { id: "LTC", name: "Litecoin", curve: "secp256k1", purpose: 44, coinType: 2, covers: ["LTC"], hmeToday: true, signing: "ready", balanceReadable: true },
  EVM: { id: "EVM", name: "Ethereum / BNB Chain / Base / PulseChain / HyperEVM", curve: "secp256k1", purpose: 44, coinType: 60, covers: ["ETH", "BNB", "USDC", "USDT", "HEX", "PLS", "pHEX", "HYPE"], hmeToday: true, signing: "ready", balanceReadable: true },
  DOGE: { id: "DOGE", name: "Dogecoin", curve: "secp256k1", purpose: 44, coinType: 3, covers: ["DOGE"], hmeToday: false, signing: "ready", balanceReadable: true },
  BCH: { id: "BCH", name: "Bitcoin Cash", curve: "secp256k1", purpose: 44, coinType: 145, covers: ["BCH"], hmeToday: false, signing: "ready", balanceReadable: true },
  ZEC: { id: "ZEC", name: "Zcash (transparent)", curve: "secp256k1", purpose: 44, coinType: 133, covers: ["ZEC"], hmeToday: false, signing: "planned", balanceReadable: true },
  XRP: { id: "XRP", name: "XRP Ledger", curve: "secp256k1", purpose: 44, coinType: 144, covers: ["XRP"], hmeToday: false, signing: "ready", balanceReadable: true },
  TRX: { id: "TRX", name: "TRON", curve: "secp256k1", purpose: 44, coinType: 195, covers: ["TRX"], hmeToday: false, signing: "ready", balanceReadable: true },
  SOL: { id: "SOL", name: "Solana", curve: "ed25519", purpose: 44, coinType: 501, covers: ["SOL"], hmeToday: false, signing: "ready", balanceReadable: true },
  DASH: { id: "DASH", name: "Dash", curve: "secp256k1", purpose: 44, coinType: 5, covers: ["DASH"], hmeToday: false, signing: "planned", balanceReadable: true },
  ATOM: { id: "ATOM", name: "Cosmos Hub", curve: "secp256k1", purpose: 44, coinType: 118, covers: ["ATOM"], hmeToday: false, signing: "planned", balanceReadable: true },
  RUNE: { id: "RUNE", name: "THORChain", curve: "secp256k1", purpose: 44, coinType: 931, covers: ["RUNE"], hmeToday: false, signing: "planned", balanceReadable: true },
  ADA: {
    id: "ADA", name: "Cardano", curve: "ed25519-bip32", purpose: 1852, coinType: 1815, covers: ["ADA"], hmeToday: false, signing: "planned", balanceReadable: true,
    recoveryNote: "restore the recovery phrase in a Cardano wallet that uses the standard (Icarus/Shelley) method, account",
  },
  XMR: {
    id: "XMR", name: "Monero", curve: "ed25519", purpose: 44, coinType: 128, covers: ["XMR"], hmeToday: false, signing: "planned", balanceReadable: false,
    recoveryNote: "restore the recovery phrase with Trezor's Monero method (not Ledger's — Ledger makes a different wallet from the same words), account",
  },
};

export const FIRST_POCKET = 1106;
export const LAST_POCKET = 2105;
/** The only pocket Seeds links, for HME Wallet and coin/wallet sign-ins alike, including after a revoke
 *  (Bobby, Nov 22 2026: HME Wallet only shares 1106 with Seeds; one number means no coins stranded in old pockets). */
export const SEEDS_POCKET = FIRST_POCKET;

export function validPocket(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= FIRST_POCKET && (n as number) <= LAST_POCKET;
}

/** Account-level path. Solana (SLIP-0010) is hardened-only, so its key lives one level deeper; Monero (Trezor) stays at the account. */
export function accountPath(coin: PocketCoin, account: number): string {
  const s = POCKET_SPECS[coin];
  const base = `m/${s.purpose}'/${s.coinType}'/${account}'`;
  return coin === "SOL" ? `${base}/0'` : base;
}

/** Path of the pocket's receive address (child 0/0 for secp256k1 coins and Cardano's payment key). */
export function receivePath(coin: PocketCoin, account: number): string {
  return coin === "SOL" || coin === "XMR" ? accountPath(coin, account) : `${accountPath(coin, account)}/0/0`;
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
