/**
 * Cross-chain swap registry (THORChain + Maya Protocol).
 *
 * Client-safe: names, asset notation, memo shortcodes and address shapes only.
 * Network calls live in router.server.ts. Every amount THORChain and Maya quote
 * is in 1e8 base units regardless of the coin's own decimals.
 */

export type Protocol = "thorchain" | "maya";

export const PROTOCOL_LABEL: Record<Protocol, string> = {
  thorchain: "THORChain",
  maya: "Maya Protocol",
};

export type SwapCoinId =
  | "BTC"
  | "ETH"
  | "LTC"
  | "DOGE"
  | "BCH"
  | "XRP"
  | "SOL"
  | "ZEC"
  | "BNB"
  | "TRX"
  | "USDC"
  | "USDT";

export type SwapCoin = {
  id: SwapCoinId;
  symbol: string;
  name: string;
  /** Human network name shown next to the coin. */
  network: string;
  /** Chain code used by THORChain/Maya inbound_addresses (BSC, TRON, ...). */
  chain: string;
  /** Full asset notation, e.g. ETH.USDC-0XA0B8... */
  asset: string;
  /** Memo shortcodes the protocols may return for this asset (verified live Nov 17 2026). */
  memoNames: string[];
  /** Protocols that list a live pool for this coin. */
  protocols: Protocol[];
  /** UTXO coins put the memo in an 80-byte OP_RETURN. */
  utxo: boolean;
  /** EVM coins are sent through the protocol's router contract. */
  evm: boolean;
  /** Format pre-check; the protocol re-validates the destination itself. */
  address: RegExp;
  addressHint: string;
  /** Addresses on these chains are case-insensitive (hex / bech32). */
  caseInsensitive: (addr: string) => boolean;
};

const B58 = "[1-9A-HJ-NP-Za-km-z]";
const hexOrBech = (addr: string) => /^0x/i.test(addr) || /^(bc1|ltc1|tex1)/i.test(addr);
const never = () => false;

export const SWAP_COINS: SwapCoin[] = [
  {
    id: "BTC", symbol: "BTC", name: "Bitcoin", network: "Bitcoin", chain: "BTC", asset: "BTC.BTC",
    memoNames: ["b", "BTC.BTC"], protocols: ["thorchain", "maya"], utxo: true, evm: false,
    address: new RegExp(`^(bc1[02-9ac-hj-np-z]{11,71}|BC1[02-9AC-HJ-NP-Z]{11,71}|[13]${B58}{25,34})$`),
    addressHint: "bc1… or 1… / 3…", caseInsensitive: hexOrBech,
  },
  {
    id: "ETH", symbol: "ETH", name: "Ether", network: "Ethereum", chain: "ETH", asset: "ETH.ETH",
    memoNames: ["e", "ETH.ETH"], protocols: ["thorchain", "maya"], utxo: false, evm: true,
    address: /^0x[0-9a-fA-F]{40}$/, addressHint: "0x…", caseInsensitive: hexOrBech,
  },
  {
    id: "LTC", symbol: "LTC", name: "Litecoin", network: "Litecoin", chain: "LTC", asset: "LTC.LTC",
    memoNames: ["l", "LTC.LTC"], protocols: ["thorchain"], utxo: true, evm: false,
    address: new RegExp(`^(ltc1[02-9ac-hj-np-z]{11,71}|[LM3]${B58}{26,33})$`),
    addressHint: "ltc1… or L… / M…", caseInsensitive: hexOrBech,
  },
  {
    id: "DOGE", symbol: "DOGE", name: "Dogecoin", network: "Dogecoin", chain: "DOGE", asset: "DOGE.DOGE",
    memoNames: ["d", "DOGE.DOGE"], protocols: ["thorchain"], utxo: true, evm: false,
    address: new RegExp(`^[DA9]${B58}{25,34}$`), addressHint: "D…", caseInsensitive: never,
  },
  {
    id: "BCH", symbol: "BCH", name: "Bitcoin Cash", network: "Bitcoin Cash", chain: "BCH", asset: "BCH.BCH",
    memoNames: ["c", "BCH.BCH"], protocols: ["thorchain"], utxo: true, evm: false,
    address: new RegExp(`^((bitcoincash:)?[qp][02-9ac-hj-np-z]{41}|1${B58}{25,33})$`),
    addressHint: "q… (CashAddr)", caseInsensitive: never,
  },
  {
    id: "XRP", symbol: "XRP", name: "XRP", network: "XRP Ledger", chain: "XRP", asset: "XRP.XRP",
    memoNames: ["x", "XRP.XRP"], protocols: ["thorchain"], utxo: false, evm: false,
    address: /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/, addressHint: "r… (no destination tag needed)", caseInsensitive: never,
  },
  {
    id: "SOL", symbol: "SOL", name: "Solana", network: "Solana", chain: "SOL", asset: "SOL.SOL",
    memoNames: ["o", "SOL.SOL"], protocols: ["thorchain"], utxo: false, evm: false,
    address: new RegExp(`^${B58}{32,44}$`), addressHint: "Solana address", caseInsensitive: never,
  },
  {
    id: "ZEC", symbol: "ZEC", name: "Zcash", network: "Zcash (transparent)", chain: "ZEC", asset: "ZEC.ZEC",
    memoNames: ["z", "ZEC.ZEC"], protocols: ["thorchain", "maya"], utxo: true, evm: false,
    address: new RegExp(`^(t1${B58}{33}|t3${B58}{33}|tex1[02-9ac-hj-np-z]{30,90})$`),
    addressHint: "t1… or tex1… (shielded z/u addresses not supported)", caseInsensitive: hexOrBech,
  },
  {
    id: "BNB", symbol: "BNB", name: "BNB", network: "BNB Chain", chain: "BSC", asset: "BSC.BNB",
    memoNames: ["s", "BSC.BNB"], protocols: ["thorchain"], utxo: false, evm: true,
    address: /^0x[0-9a-fA-F]{40}$/, addressHint: "0x…", caseInsensitive: hexOrBech,
  },
  {
    id: "TRX", symbol: "TRX", name: "TRON", network: "TRON", chain: "TRON", asset: "TRON.TRX",
    memoNames: ["tr", "TRON.TRX"], protocols: ["thorchain"], utxo: false, evm: false,
    address: new RegExp(`^T${B58}{33}$`), addressHint: "T…", caseInsensitive: never,
  },
  {
    id: "USDC", symbol: "USDC", name: "USD Coin", network: "Ethereum", chain: "ETH",
    asset: "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48",
    memoNames: ["ETH.USDC", "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48"],
    protocols: ["thorchain", "maya"], utxo: false, evm: true,
    address: /^0x[0-9a-fA-F]{40}$/, addressHint: "0x…", caseInsensitive: hexOrBech,
  },
  {
    id: "USDT", symbol: "USDT", name: "Tether", network: "Ethereum", chain: "ETH",
    asset: "ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7",
    memoNames: ["ETH.USDT", "ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7"],
    protocols: ["thorchain", "maya"], utxo: false, evm: true,
    address: /^0x[0-9a-fA-F]{40}$/, addressHint: "0x…", caseInsensitive: hexOrBech,
  },
];

export const SWAP_COIN_IDS = SWAP_COINS.map((c) => c.id) as [SwapCoinId, ...SwapCoinId[]];

export function swapCoin(id: string): SwapCoin | null {
  return SWAP_COINS.find((c) => c.id === id) ?? null;
}

/**
 * Seeds affiliate (fee) per protocol. null = no affiliate in the memo.
 * A name must be registered on-chain (THORName / MAYAName) before it can be set;
 * as of Nov 17 2026 "seeds" is not registered on THORChain.
 */
export const SEEDS_AFFILIATE: Record<Protocol, { name: string; bps: number } | null> = {
  thorchain: null,
  maya: null,
};
