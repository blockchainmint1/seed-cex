/** Coins offered before a member searches. Anything else: search or paste its address. Client-safe. */
import { NATIVE, type DexNetwork } from "./venues";
import { TSD_DEX } from "./swap-rules";
import { ECOSYSTEM_TOKENS } from "./ecosystem-tokens";

export type StarterCoin = { address: string; symbol: string; name: string };

export const STARTER_COINS: Record<DexNetwork, readonly StarterCoin[]> = {
  ethereum: [
    // TSD goes through TSD Bridge (TSD <-> Ethereum USDC) and then the pool.
    { address: TSD_DEX, symbol: "TSD", name: "TSD · TEXITcoin (through TSD Bridge)" },
    // Honest Money wrapped coins (Uniswap pools).
    ...ECOSYSTEM_TOKENS.map((t) => ({ address: t.address, symbol: t.symbol, name: `${t.name} · Honest Money` })),
    { address: NATIVE, symbol: "ETH", name: "Ether" },
    { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", name: "USD Coin" },
    { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", name: "Tether" },
    { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", symbol: "WBTC", name: "Wrapped Bitcoin" },
    { address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", symbol: "UNI", name: "Uniswap" },
    { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", symbol: "LINK", name: "Chainlink" },
    { address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", symbol: "PEPE", name: "Pepe" },
  ],
  base: [
    { address: NATIVE, symbol: "ETH", name: "Ether on Base" },
    { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", name: "USD Coin" },
    { address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", symbol: "cbBTC", name: "Coinbase Wrapped BTC" },
    { address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", symbol: "AERO", name: "Aerodrome" },
    { address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", symbol: "DEGEN", name: "Degen" },
  ],
  bsc: [
    { address: NATIVE, symbol: "BNB", name: "BNB" },
    { address: "0x55d398326f99059fF775485246999027B3197955", symbol: "USDT", name: "Tether (BNB Chain)" },
    { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", symbol: "USDC", name: "USD Coin (BNB Chain)" },
    { address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", symbol: "CAKE", name: "PancakeSwap" },
    { address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", symbol: "BTCB", name: "Bitcoin (BNB Chain)" },
    { address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", symbol: "ETH", name: "Ether (BNB Chain)" },
  ],
  pulsechain: [
    { address: NATIVE, symbol: "PLS", name: "Pulse" },
    { address: "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39", symbol: "pHEX", name: "HEX on PulseChain" },
    { address: "0x95B303987A60C71504D99Aa1b13B4DA07b0790ab", symbol: "PLSX", name: "PulseX" },
    { address: "0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d", symbol: "INC", name: "Incentive" },
    { address: "0xefD766cCb38EaF1dfd701853BFCe31359239F305", symbol: "DAI", name: "DAI from Ethereum (bridged)" },
    { address: "0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07", symbol: "USDC", name: "USDC from Ethereum (bridged)" },
  ],
};

/** Seeds' own label for a coin (e.g. HEX on PulseChain is "pHEX"), falling back to the contract's symbol. */
export function displaySymbol(network: DexNetwork, address: string, symbol: string): string {
  const s = STARTER_COINS[network].find((c) => c.address.toLowerCase() === address.toLowerCase());
  return s?.symbol ?? symbol;
}
