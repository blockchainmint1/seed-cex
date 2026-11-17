/**
 * Coins Seeds AI may offer: only ones Seeds can actually buy and sell back
 * (THORChain route + a pocket key Seeds can sign for). Stablecoins are left
 * out — the plan's cash is TSD. Admins switch these on/off in /admin/ai.
 */
import { swapCoin } from "@/lib/xchain/assets";
import { receivePocket, sendSource } from "@/lib/xchain/send-rules";
import type { PocketCoin } from "@/lib/pockets/coins";

export type CatalogCoin = { geckoId: string; swapCoin: string; symbol: string; name: string; binance: string };

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
  { geckoId: "thorwallet", swapCoin: "TGT", symbol: "tgt", name: "THORWallet", binance: "TGTUSDT" },
  { geckoId: "thorstarter", swapCoin: "XRUNE", symbol: "xrune", name: "Thorstarter", binance: "XRUNEUSDT" },
];

export const catalogByGecko = (id: string) => AI_CATALOG.find((c) => c.geckoId === id) ?? null;

/** True when Seeds has a THORChain route it can sign for, both buying into and selling out of this coin. */
export function aiBuyable(swapId: string | null | undefined): boolean {
  const c = swapId ? swapCoin(swapId) : null;
  return Boolean(c && c.protocols.includes("thorchain") && sendSource(c) && receivePocket(c));
}

/** The member pocket that holds this coin (needed before a plan can include it). */
export function aiPocketFor(swapId: string | null | undefined): PocketCoin | null {
  const c = swapId ? swapCoin(swapId) : null;
  return c ? receivePocket(c) : null;
}
