/**
 * Chain + asset registry.
 *
 * Client-safe: addresses, decimals, and labels only. RPC calls live in
 * `evm.server.ts` / `rpc.server.ts` so browser tabs never hammer endpoints
 * directly.
 */

export type ChainId = "txc" | "ethereum" | "base" | "bsc" | "ltc" | "isk" | "zcu" | "btc";

/** Every settlement leg Seeds can deliver on-chain. */
export type LegId =
  | "txc"
  | "tsd"
  | "usdc"
  | "usdt"
  | "ltc"
  | "isk"
  | "zcu"
  | "wbtc"
  | "wltc"
  | "weth";

export type AssetDef = {
  symbol: string;
  /** null = the chain's native coin */
  contract: string | null;
  decimals: number;
  /** Omni Layer property id, for tokens that live on the TEXITcoin L2. */
  omniPropertyId?: number;
};

export type ChainDef = {
  id: ChainId;
  name: string;
  /** EVM numeric chain id; null for UTXO chains */
  evmChainId: number | null;
  nativeSymbol: string;
  /** base58 P2PKH version byte — legacy UTXO chains only */
  p2pkhVersion?: number;
  /** bech32 HRP — native-segwit UTXO chains only (BTC) */
  bech32Hrp?: string;
  /** BIP-44 branch used for the *shared* trading account on this chain. */
  sharedPath: string;
  assets: AssetDef[];
  explorer: string;
};

/** Litecoin's SLIP-0044 coin type. ISK is a Litecoin fork and inherits it. */
const LTC_COIN_TYPE = 2;

export const CHAINS: ChainDef[] = [
  {
    id: "txc",
    name: "TEXITcoin",
    evmChainId: null,
    nativeSymbol: "TXC",
    p2pkhVersion: 66,
    // SLIP-0044 coin type 696969, matching wallet.texitcoin.org
    sharedPath: "m/44'/696969'/9'/0/0",
    assets: [
      { symbol: "TXC", contract: null, decimals: 8 },
      // Texas Stable Dollar — Omni Layer property #39 on TEXITcoin.
      { symbol: "TSD", contract: null, decimals: 8, omniPropertyId: 39 },
      // Reserve-backed wrapped majors, issued by the TSD Swap wrap desk.
      { symbol: "wBTC", contract: null, decimals: 8, omniPropertyId: 43 },
      { symbol: "wLTC", contract: null, decimals: 8, omniPropertyId: 44 },
      { symbol: "wETH", contract: null, decimals: 8, omniPropertyId: 45 },
    ],
    explorer: "https://mempool.texitcoin.org/address/",
  },
  {
    id: "base",
    name: "Base",
    evmChainId: 8453,
    nativeSymbol: "ETH",
    sharedPath: "m/44'/60'/9'/0/0",
    assets: [
      { symbol: "ETH", contract: null, decimals: 18 },
      { symbol: "USDC", contract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
      { symbol: "USDT", contract: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6 },
    ],
    explorer: "https://basescan.org/address/",
  },
  {
    id: "ethereum",
    name: "Ethereum",
    evmChainId: 1,
    nativeSymbol: "ETH",
    sharedPath: "m/44'/60'/9'/0/0",
    assets: [
      { symbol: "ETH", contract: null, decimals: 18 },
      { symbol: "USDC", contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
      { symbol: "USDT", contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    ],
    explorer: "https://etherscan.io/address/",
  },
  {
    id: "bsc",
    name: "BNB Chain",
    evmChainId: 56,
    nativeSymbol: "BNB",
    sharedPath: "m/44'/60'/9'/0/0",
    assets: [
      { symbol: "BNB", contract: null, decimals: 18 },
      { symbol: "USDC", contract: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
      { symbol: "USDT", contract: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
    ],
    explorer: "https://bscscan.com/address/",
  },
  {
    id: "ltc",
    name: "Litecoin",
    evmChainId: null,
    nativeSymbol: "LTC",
    p2pkhVersion: 48,
    sharedPath: `m/44'/${LTC_COIN_TYPE}'/9'/0/0`,
    assets: [{ symbol: "LTC", contract: null, decimals: 8 }],
    explorer: "https://blockchair.com/litecoin/address/",
  },
  {
    id: "isk",
    name: "Iskandercoin",
    evmChainId: null,
    nativeSymbol: "ISK",
    p2pkhVersion: 45,
    sharedPath: `m/44'/${LTC_COIN_TYPE}'/19'/0/0`,
    assets: [{ symbol: "ISK", contract: null, decimals: 8 }],
    explorer: "https://explorer.iskandercoin.com/address/",
  },
  {
    // Bitcoin mainnet, BIP-84 native segwit. BTC is deposit-to-trade only:
    // the branch balance is swept to the wrap issuer when you authorize.
    id: "btc",
    name: "Bitcoin",
    evmChainId: null,
    nativeSymbol: "BTC",
    bech32Hrp: "bc",
    sharedPath: "m/84'/0'/9'/0/0",
    assets: [{ symbol: "BTC", contract: null, decimals: 8 }],
    explorer: "https://mempool.space/address/",
  },
  {
    id: "zcu",
    name: "ZeroChill",
    evmChainId: 90031273,
    nativeSymbol: "ZCU",
    sharedPath: "m/44'/60'/9'/0/0",
    assets: [{ symbol: "ZCU", contract: null, decimals: 18 }],
    explorer: "https://explorer.zerochill.com/address/",
  },
];

export const CHAIN_IDS = CHAINS.map((c) => c.id) as [ChainId, ...ChainId[]];

export function getChain(id: string): ChainDef {
  const chain = CHAINS.find((c) => c.id === id);
  if (!chain) throw new Error(`Unknown chain: ${id}`);
  return chain;
}

export function isEvmChain(id: string): boolean {
  return getChain(id).evmChainId !== null;
}

/** UTXO chains Seeds can build and sign legacy P2PKH spends on. */
export const UTXO_CHAIN_IDS = ["txc", "ltc", "isk"] as const;
export type UtxoChainId = (typeof UTXO_CHAIN_IDS)[number];

export function isUtxoChain(id: string): id is UtxoChainId {
  return (UTXO_CHAIN_IDS as readonly string[]).includes(id);
}

/** Preset authorization windows. Short by default — that is the whole point. */
export const EXPIRY_PRESETS = [
  { label: "1 hour", hours: 1 },
  { label: "6 hours", hours: 6 },
  { label: "24 hours", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
  { label: "30 days", hours: 720 },
] as const;

/* ---------------------------------- legs ---------------------------------- */

export type LegKind = "utxo" | "omni" | "evm";

export type LegDef = {
  id: LegId;
  symbol: string;
  kind: LegKind;
  /** For utxo/omni legs: the single chain it settles on. */
  chain?: ChainId;
  /** For EVM legs: which chains can deliver it. */
  evmChains?: ChainId[];
  /** EVM native-coin leg (ZCU) rather than an ERC-20 transfer. */
  native?: boolean;
};

export const LEGS: Record<LegId, LegDef> = {
  txc: { id: "txc", symbol: "TXC", kind: "utxo", chain: "txc" },
  ltc: { id: "ltc", symbol: "LTC", kind: "utxo", chain: "ltc" },
  isk: { id: "isk", symbol: "ISK", kind: "utxo", chain: "isk" },
  tsd: { id: "tsd", symbol: "TSD", kind: "omni", chain: "txc" },
  usdc: { id: "usdc", symbol: "USDC", kind: "evm", evmChains: ["base", "ethereum", "bsc"] },
  usdt: { id: "usdt", symbol: "USDT", kind: "evm", evmChains: ["base", "ethereum", "bsc"] },
  zcu: { id: "zcu", symbol: "ZCU", kind: "evm", evmChains: ["zcu"], native: true },
  wbtc: { id: "wbtc", symbol: "wBTC", kind: "omni", chain: "txc" },
  wltc: { id: "wltc", symbol: "wLTC", kind: "omni", chain: "txc" },
  weth: { id: "weth", symbol: "wETH", kind: "omni", chain: "txc" },
};

/** Every leg that settles as an Omni property on TEXITcoin. */
export const OMNI_LEG_IDS = ["tsd", "wbtc", "wltc", "weth"] as const;
export type OmniLegId = (typeof OMNI_LEG_IDS)[number];

export function isOmniLeg(id: string): id is OmniLegId {
  return (OMNI_LEG_IDS as readonly string[]).includes(id);
}

/** Symbol + Omni property id for a leg that lives on the TEXITcoin L2. */
export function omniLegAsset(leg: OmniLegId): { symbol: string; propertyId: number } {
  const symbol = LEGS[leg].symbol;
  const asset = getChain("txc").assets.find((a) => a.symbol === symbol);
  if (!asset?.omniPropertyId) throw new Error(`No Omni property configured for ${symbol}`);
  return { symbol, propertyId: asset.omniPropertyId };
}

export function getLeg(id: string): LegDef {
  const leg = LEGS[id as LegId];
  if (!leg) throw new Error(`Unknown settlement leg: ${id}`);
  return leg;
}

/* ---------------------------------- pairs --------------------------------- */

/** The Omni property id of TSD, the exchange's native settlement dollar. */
export const TSD_PROPERTY_ID = 39;

export type PairId =
  | "TSD_TXC"
  | "TSD_USDC"
  | "LTC_TSD"
  | "ISK_TSD"
  | "ZCU_TSD"
  | "BTC_TSD"
  | "ETH_TSD";

export type PairDef = {
  id: PairId;
  /** URL segment under /trade */
  slug: string;
  label: string;
  /** The asset being bought and sold — order sizes are denominated in it. */
  base: string;
  /** The asset the price is quoted in. */
  quote: string;
  /** Escrow leg that delivers the base asset. */
  baseLeg: LegId;
  /** Escrow leg that delivers the quote asset. */
  quoteLeg: LegId;
  blurb: string;
  /** Both legs settle on the TEXITcoin chain. */
  native: boolean;
};

export const PAIRS: PairDef[] = [
  {
    id: "TSD_TXC",
    slug: "tsd-txc",
    label: "TXC / TSD",
    base: "TXC",
    quote: "TSD",
    baseLeg: "txc",
    quoteLeg: "tsd",
    blurb:
      "TEXITcoin against the Texas Stable Dollar — both legs settle on the TEXITcoin chain, no bridge in the middle.",
    native: true,
  },
  {
    id: "TSD_USDC",
    slug: "tsd-usdc",
    label: "TSD / USDC",
    base: "TSD",
    quote: "USDC",
    baseLeg: "tsd",
    quoteLeg: "usdc",
    blurb: "The Texas Stable Dollar against USDC — Omni #39 on one side, EVM stablecoin on the other.",
    native: false,
  },
  {
    id: "LTC_TSD",
    slug: "ltc-tsd",
    label: "LTC / TSD",
    base: "LTC",
    quote: "TSD",
    baseLeg: "ltc",
    quoteLeg: "tsd",
    blurb: "Litecoin priced in Texas Stable Dollars, settled peer to peer on both chains.",
    native: false,
  },
  {
    id: "ISK_TSD",
    slug: "isk-tsd",
    label: "ISK / TSD",
    base: "ISK",
    quote: "TSD",
    baseLeg: "isk",
    quoteLeg: "tsd",
    blurb: "Iskandercoin priced in Texas Stable Dollars, settled through our own ISK node.",
    native: false,
  },
  {
    id: "ZCU_TSD",
    slug: "zcu-tsd",
    label: "ZCU / TSD",
    base: "ZCU",
    quote: "TSD",
    baseLeg: "zcu",
    quoteLeg: "tsd",
    blurb: "ZeroChill priced in Texas Stable Dollars — native ZCU transfers on the ZeroChill network.",
    native: false,
  },
  {
    id: "BTC_TSD",
    slug: "btc-tsd",
    label: "BTC / TSD",
    base: "BTC",
    quote: "TSD",
    baseLeg: "wbtc",
    quoteLeg: "tsd",
    blurb: "Bitcoin priced in Texas Stable Dollars. Deposit native BTC — it settles on the TEXITcoin chain instantly.",
    native: false,
  },
  {
    id: "ETH_TSD",
    slug: "eth-tsd",
    label: "ETH / TSD",
    base: "ETH",
    quote: "TSD",
    baseLeg: "weth",
    quoteLeg: "tsd",
    blurb: "Ether priced in Texas Stable Dollars. Deposit native ETH — it settles on the TEXITcoin chain instantly.",
    native: false,
  },
];

export const PAIR_IDS = PAIRS.map((p) => p.id) as [PairId, ...PairId[]];

export function getPair(id: string): PairDef {
  const pair = PAIRS.find((p) => p.id === id || p.slug === id);
  if (!pair) throw new Error(`Unknown pair: ${id}`);
  return pair;
}
