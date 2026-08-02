/**
 * Chain + asset registry.
 *
 * Client-safe: addresses, decimals, and labels only. RPC calls live in
 * `evm.server.ts` so browser tabs never hammer public endpoints directly.
 */

export type ChainId = "txc" | "ethereum" | "base" | "bsc";

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
  /** EVM numeric chain id; null for TEXITcoin */
  evmChainId: number | null;
  nativeSymbol: string;
  /** BIP-44 branch used for the *shared* trading account on this chain. */
  sharedPath: string;
  assets: AssetDef[];
  explorer: string;
};

export const CHAINS: ChainDef[] = [
  {
    id: "txc",
    name: "TEXITcoin",
    evmChainId: null,
    nativeSymbol: "TXC",
    // SLIP-0044 coin type 696969, matching wallet.texitcoin.org
    sharedPath: "m/44'/696969'/9'/0/0",
    assets: [{ symbol: "TXC", contract: null, decimals: 8 }],
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

/** Preset authorization windows. Short by default — that is the whole point. */
export const EXPIRY_PRESETS = [
  { label: "1 hour", hours: 1 },
  { label: "6 hours", hours: 6 },
  { label: "24 hours", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
  { label: "30 days", hours: 720 },
] as const;
