/**
 * Coins Seeds AI may offer: only ones Seeds can actually buy and sell back —
 * a THORChain route + a pocket key Seeds can sign for, or (PLS, HEX, pHEX) a
 * Seeds TSD market whose coin leg settles from the member's own EVM pocket.
 * Market coins only fill when someone is selling on the book. Stablecoins are
 * left out — the plan's cash is TSD. Admins switch these on/off in /admin/ai.
 * TGT and XRUNE are buyable but left out: no price source still tracks them, so they can't be tested.
 */
import { swapCoin } from "@/lib/xchain/assets";
import { receivePocket, sendSource } from "@/lib/xchain/send-rules";
import type { PocketCoin } from "@/lib/pockets/coins";
import { getLeg, PAIRS } from "@/lib/chains";

/** `swapCoin` is a THORChain coin id, or "SEEDS:<pair id>" for coins bought on a Seeds TSD market. `binance` null = no Binance history (CoinGecko only). */
export type CatalogCoin = { geckoId: string; swapCoin: string; symbol: string; name: string; binance: string | null };

const SEEDS_MARKET = "SEEDS:";

export const AI_CATALOG: CatalogCoin[] = [
  { geckoId: "bitcoin", swapCoin: "BTC", symbol: "btc", name: "Bitcoin", binance: "BTCUSDT" },
  { geckoId: "ethereum", swapCoin: "ETH", symbol: "eth", name: "Ethereum", binance: "ETHUSDT" },
  { geckoId: "litecoin", swapCoin: "LTC", symbol: "ltc", name: "Litecoin", binance: "LTCUSDT" },
  { geckoId: "ripple", swapCoin: "XRP", symbol: "xrp", name: "XRP", binance: "XRPUSDT" },
  { geckoId: "solana", swapCoin: "SOL", symbol: "sol", name: "Solana", binance: "SOLUSDT" },
  { geckoId: "tron", swapCoin: "TRX", symbol: "trx", name: "TRON", binance: "TRXUSDT" },
  { geckoId: "dogecoin", swapCoin: "DOGE", symbol: "doge", name: "Dogecoin", binance: "DOGEUSDT" },
  { geckoId: "bitcoin-cash", swapCoin: "BCH", symbol: "bch", name: "Bitcoin Cash", binance: "BCHUSDT" },
  { geckoId: "aave", swapCoin: "AAVE", symbol: "aave", name: "Aave", binance: "AAVEUSDT" },
  { geckoId: "wrapped-bitcoin", swapCoin: "WBTC", symbol: "wbtc", name: "Wrapped Bitcoin (Ethereum)", binance: "WBTCUSDT" },
  { geckoId: "thorswap", swapCoin: "THOR", symbol: "thor", name: "THORSwap", binance: "THORUSDT" },
  { geckoId: "pulsechain", swapCoin: "SEEDS:PLS_TSD", symbol: "pls", name: "PulseChain", binance: null },
  { geckoId: "hex", swapCoin: "SEEDS:HEX_TSD", symbol: "hex", name: "HEX (Ethereum)", binance: null },
  { geckoId: "hex-pulsechain", swapCoin: "SEEDS:PHEX_TSD", symbol: "phex", name: "HEX (PulseChain)", binance: null },
];

/** The Seeds TSD market a catalog coin is bought on, when it isn't a THORChain coin. */
function seedsMarket(swapId: string) {
  if (!swapId.startsWith(SEEDS_MARKET)) return null;
  const pair = PAIRS.find((p) => p.id === swapId.slice(SEEDS_MARKET.length));
  return pair && pair.quote === "TSD" && getLeg(pair.baseLeg).kind === "evm" ? pair : null;
}

export const catalogByGecko = (id: string) => AI_CATALOG.find((c) => c.geckoId === id) ?? null;

/** True when Seeds has a THORChain route it can sign for, both buying into and selling out of this coin. */
export function aiBuyable(swapId: string | null | undefined): boolean {
  if (swapId?.startsWith(SEEDS_MARKET)) return seedsMarket(swapId) !== null;
  const c = swapId ? swapCoin(swapId) : null;
  return Boolean(c && c.protocols.includes("thorchain") && sendSource(c) && receivePocket(c));
}

/** The member pocket that holds this coin (needed before a plan can include it). */
export function aiPocketFor(swapId: string | null | undefined): PocketCoin | null {
  if (swapId?.startsWith(SEEDS_MARKET)) return seedsMarket(swapId) ? "EVM" : null;
  const c = swapId ? swapCoin(swapId) : null;
  return c ? receivePocket(c) : null;
}
