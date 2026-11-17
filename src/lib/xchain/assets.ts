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

/** Stable coin id used in URLs and requests, e.g. "BTC", "USDC" (Ethereum), "USDC.BSC". */
export type SwapCoinId = string;

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
  /** Protocol-independent memo names: full notation, plus ticker form for tokens. */
  memoNames: string[];
  /**
   * One-letter memo shortcodes, per protocol, only where verified live. Shortcodes
   * differ between protocols ("a" is AVAX on THORChain but Arbitrum ETH on Maya),
   * so a shortcode is never trusted outside its own protocol.
   */
  shortcodes: Partial<Record<Protocol, string>>;
  /** Protocols that list a live pool for this coin. */
  protocols: Protocol[];
  /** UTXO coins put the memo in an 80-byte OP_RETURN. */
  utxo: boolean;
  /** EVM coins are sent through the protocol's router contract. */
  evm: boolean;
  /** A token on another coin's network (ERC-20, BEP-20, TRC-20...). */
  token: boolean;
  /** Format pre-check; the protocol re-validates the destination itself. */
  address: RegExp;
  addressHint: string;
  /** Addresses on these chains are case-insensitive (hex / bech32). */
  caseInsensitive: (addr: string) => boolean;
};

const B58 = "[1-9A-HJ-NP-Za-km-z]";
const BECH = "[02-9ac-hj-np-z]";
const hexOrBech = (addr: string) => /^0x/i.test(addr) || /^(bc1|ltc1|tex1|cosmos1|thor1|addr1)/i.test(addr);
const never = () => false;

type ChainDef = {
  network: string;
  utxo: boolean;
  evm: boolean;
  address: RegExp;
  addressHint: string;
  caseInsensitive: (addr: string) => boolean;
};

const EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;
const evmChain = (network: string): ChainDef => ({
  network, utxo: false, evm: true, address: EVM_ADDR, addressHint: "0x…", caseInsensitive: hexOrBech,
});

/** One entry per network. Address rules apply to every coin on that network. */
export const SWAP_CHAINS: Record<string, ChainDef> = {
  BTC: {
    network: "Bitcoin", utxo: true, evm: false,
    address: new RegExp(`^(bc1${BECH}{11,71}|BC1[02-9AC-HJ-NP-Z]{11,71}|[13]${B58}{25,34})$`),
    addressHint: "bc1… or 1… / 3…", caseInsensitive: hexOrBech,
  },
  LTC: {
    network: "Litecoin", utxo: true, evm: false,
    address: new RegExp(`^(ltc1${BECH}{11,71}|[LM3]${B58}{26,33})$`),
    addressHint: "ltc1… or L… / M…", caseInsensitive: hexOrBech,
  },
  DOGE: { network: "Dogecoin", utxo: true, evm: false, address: new RegExp(`^[DA9]${B58}{25,34}$`), addressHint: "D…", caseInsensitive: never },
  BCH: {
    network: "Bitcoin Cash", utxo: true, evm: false,
    address: new RegExp(`^((bitcoincash:)?[qp]${BECH}{41}|1${B58}{25,33})$`),
    addressHint: "q… (CashAddr)", caseInsensitive: never,
  },
  ZEC: {
    network: "Zcash (transparent)", utxo: true, evm: false,
    address: new RegExp(`^(t1${B58}{33}|t3${B58}{33}|tex1${BECH}{30,90})$`),
    addressHint: "t1… or tex1… (shielded z/u addresses not supported)", caseInsensitive: hexOrBech,
  },
  DASH: { network: "Dash", utxo: true, evm: false, address: new RegExp(`^[X7]${B58}{33}$`), addressHint: "X…", caseInsensitive: never },
  XRP: { network: "XRP Ledger", utxo: false, evm: false, address: /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/, addressHint: "r… (no destination tag needed)", caseInsensitive: never },
  SOL: { network: "Solana", utxo: false, evm: false, address: new RegExp(`^${B58}{32,44}$`), addressHint: "Solana address", caseInsensitive: never },
  TRON: { network: "TRON", utxo: false, evm: false, address: new RegExp(`^T${B58}{33}$`), addressHint: "T…", caseInsensitive: never },
  GAIA: { network: "Cosmos Hub", utxo: false, evm: false, address: new RegExp(`^cosmos1(${BECH}{38}|${BECH}{58})$`), addressHint: "cosmos1… (no memo needed)", caseInsensitive: hexOrBech },
  THOR: { network: "THORChain", utxo: false, evm: false, address: new RegExp(`^thor1(${BECH}{38}|${BECH}{58})$`), addressHint: "thor1…", caseInsensitive: hexOrBech },
  ADA: { network: "Cardano", utxo: false, evm: false, address: new RegExp(`^addr1${BECH}{50,110}$`), addressHint: "addr1… (Shelley address)", caseInsensitive: hexOrBech },
  ETH: evmChain("Ethereum"),
  BSC: evmChain("BNB Chain"),
  AVAX: evmChain("Avalanche C-Chain"),
  BASE: evmChain("Base"),
  ARB: evmChain("Arbitrum"),
};

const T: Protocol[] = ["thorchain"];
const M: Protocol[] = ["maya"];
const TM: Protocol[] = ["thorchain", "maya"];

function coin(
  id: string, symbol: string, name: string, asset: string, protocols: Protocol[],
  shortcodes: Partial<Record<Protocol, string>> = {},
): SwapCoin {
  const chain = asset.split(".")[0]!;
  const def = SWAP_CHAINS[chain];
  if (!def) throw new Error(`no chain definition for ${asset}`);
  const token = asset.includes("-");
  const base = asset.split("-")[0]!;
  return {
    id, symbol, name, network: def.network, chain, asset, protocols,
    memoNames: [asset, ...(token ? [base] : [])],
    shortcodes,
    utxo: def.utxo, evm: def.evm, token,
    address: def.address, addressHint: def.addressHint, caseInsensitive: def.caseInsensitive,
  };
}

/**
 * Every pool THORChain and Maya listed as Available on 17 Nov 2026, except each
 * protocol's own native tokens (RUNE on THORChain, CACAO/MAYA on Maya, RUJI, TCY),
 * which move by a different kind of transaction. A pool that later closes simply
 * shows as unavailable in status; nothing is ever sent to a route that is not live.
 */
export const SWAP_COINS: SwapCoin[] = [
  // Native coins
  coin("BTC", "BTC", "Bitcoin", "BTC.BTC", TM, { thorchain: "b", maya: "b" }),
  coin("ETH", "ETH", "Ether", "ETH.ETH", TM, { thorchain: "e", maya: "e" }),
  coin("LTC", "LTC", "Litecoin", "LTC.LTC", T, { thorchain: "l" }),
  coin("DOGE", "DOGE", "Dogecoin", "DOGE.DOGE", T, { thorchain: "d" }),
  coin("BCH", "BCH", "Bitcoin Cash", "BCH.BCH", T, { thorchain: "c" }),
  coin("XRP", "XRP", "XRP", "XRP.XRP", T, { thorchain: "x" }),
  coin("SOL", "SOL", "Solana", "SOL.SOL", T, { thorchain: "o" }),
  coin("ZEC", "ZEC", "Zcash", "ZEC.ZEC", TM, { thorchain: "z", maya: "z" }),
  coin("BNB", "BNB", "BNB", "BSC.BNB", T, { thorchain: "s" }),
  coin("TRX", "TRX", "TRON", "TRON.TRX", T, { thorchain: "tr" }),
  coin("AVAX", "AVAX", "Avalanche", "AVAX.AVAX", T, { thorchain: "a" }),
  coin("ATOM", "ATOM", "Cosmos", "GAIA.ATOM", T, { thorchain: "g" }),
  coin("ETH.BASE", "ETH", "Ether on Base", "BASE.ETH", T),
  coin("ETH.ARB", "ETH", "Ether on Arbitrum", "ARB.ETH", M, { maya: "a" }),
  coin("ADA", "ADA", "Cardano", "ADA.ADA", M),
  coin("DASH", "DASH", "Dash", "DASH.DASH", M, { maya: "d" }),
  coin("RUNE", "RUNE", "THORChain RUNE", "THOR.RUNE", M),
  // Stablecoins
  coin("USDC", "USDC", "USD Coin", "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48", TM),
  coin("USDT", "USDT", "Tether", "ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7", TM),
  coin("DAI", "DAI", "Dai", "ETH.DAI-0X6B175474E89094C44DA98B954EEDEAC495271D0F", T),
  coin("GUSD", "GUSD", "Gemini Dollar", "ETH.GUSD-0X056FD409E1D7A124BD7017459DFEA2F387B6D5CD", T),
  coin("LUSD", "LUSD", "Liquity USD", "ETH.LUSD-0X5F98805A4E8BE255A32880FDEC7F6728C6568BA0", T),
  coin("USDP", "USDP", "Pax Dollar", "ETH.USDP-0X8E870D67F660D95D5BE530380D0EC0BD388289E1", T),
  coin("USDC.BSC", "USDC", "USD Coin", "BSC.USDC-0X8AC76A51CC950D9822D68B83FE1AD97B32CD580D", T),
  coin("USDT.BSC", "USDT", "Tether", "BSC.USDT-0X55D398326F99059FF775485246999027B3197955", T),
  coin("BUSD.BSC", "BUSD", "Binance USD", "BSC.BUSD-0XE9E7CEA3DEDCA5984780BAFC599BD69ADD087D56", T),
  coin("USDC.AVAX", "USDC", "USD Coin", "AVAX.USDC-0XB97EF9EF8734C71904D8002F8B6BC66DD9C48A6E", T),
  coin("USDT.AVAX", "USDT", "Tether", "AVAX.USDT-0X9702230A8EA53601F5CD2DC00FDBC13D4DF4A8C7", T),
  coin("USDC.BASE", "USDC", "USD Coin", "BASE.USDC-0X833589FCD6EDB6E08F4C7C32D4F71B54BDA02913", T),
  coin("USDT.TRON", "USDT", "Tether", "TRON.USDT-TR7NHQJEKQXGTCI8Q8ZY4PL8OTSZGJLJ6T", T),
  coin("USDC.ARB", "USDC", "USD Coin", "ARB.USDC-0XAF88D065E77C8CC2239327C5EDB3A432268E5831", M),
  coin("USDT.ARB", "USDT", "Tether", "ARB.USDT-0XFD086BC7CD5C481DCC9C85EBE478A1C0B69FCBB9", M),
  // Bitcoin and Ether on other networks
  coin("WBTC", "WBTC", "Wrapped Bitcoin", "ETH.WBTC-0X2260FAC5E5542A773AA44FBCFEDF7C193BC2C599", T),
  coin("WBTC.ARB", "WBTC", "Wrapped Bitcoin", "ARB.WBTC-0X2F2A2543B76A4166549F7AAB2E75BEF0AEFC5B0F", M),
  coin("BTCB.BSC", "BTCB", "Bitcoin on BNB Chain", "BSC.BTCB-0X7130D2A12B9BCBFAE4F2634D864A1EE1CE3EAD9C", T),
  coin("ETH.BSC", "ETH", "Ether on BNB Chain", "BSC.ETH-0X2170ED0880AC9A755FD29B2688956BD959F933F8", T),
  coin("WSTETH", "wstETH", "Lido staked Ether", "ETH.WSTETH-0X7F39C581F595B53C5CB19BD0B3F8DA6C935E2CA0", M),
  coin("WSTETH.ARB", "wstETH", "Lido staked Ether", "ARB.WSTETH-0X5979D7B546E38E414F7E9822514BE443A4800529", M),
  // Other tokens
  coin("AAVE", "AAVE", "Aave", "ETH.AAVE-0X7FC66500C84A76AD7E9C93437BFC5AC33E2DDAE9", T),
  coin("THOR", "THOR", "THORSwap", "ETH.THOR-0XA5F2211B9B8170F694421F2046281775E8468044", T),
  coin("TGT", "TGT", "THORWallet", "ETH.TGT-0X108A850856DB3F85D0269A2693D896B394C80325", T),
  coin("XRUNE", "XRUNE", "Thorstarter", "ETH.XRUNE-0X69FA0FEE221AD11012BAB0FDB45D444D3D2CE71C", T),
  coin("MOCA", "MOCA", "Moca Network", "ETH.MOCA-0X53312F85BBA24C8CB99CFFC13BF82420157230D3", M),
  coin("VVV.BASE", "VVV", "Venice", "BASE.VVV-0XACFE6019ED1A7DC6F7B508C02D1B04EC88CC21BF", T),
  coin("GLD.ARB", "GLD", "GoldenBoys", "ARB.GLD-0XAFD091F140C21770F4E5D53D26B2859AE97555AA", M),
  coin("YUM.ARB", "YUM", "Yum", "ARB.YUM-0X9F41B34F42058A7B74672055A5FAE22C4B113FD1", M),
];

/** Groups for the coin picker. */
export function swapCoinGroup(c: SwapCoin): "Coins" | "Stablecoins" | "Bitcoin & Ether on other networks" | "Other tokens" {
  if (!c.token && !c.id.includes(".")) return "Coins";
  if (/^(USD|DAI|GUSD|LUSD|BUSD)/.test(c.symbol)) return "Stablecoins";
  if (/^(WBTC|BTCB|ETH|wstETH)$/.test(c.symbol)) return "Bitcoin & Ether on other networks";
  return "Other tokens";
}

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
