import type { LegId } from "@/lib/chains";

/** Coins sellers can list. BTC settles as wBTC on TEXITcoin under the hood. */
export const P2P_ASSETS = {
  TSD: { leg: "tsd" as LegId, family: "txc", name: "Texas Stable Dollar", decimals: 2 },
  TXC: { leg: "txc" as LegId, family: "txc", name: "TEXITcoin", decimals: 4 },
  BTC: { leg: "wbtc" as LegId, family: "txc", name: "Bitcoin", decimals: 8 },
  USDC: { leg: "usdc" as LegId, family: "evm", name: "USD Coin", decimals: 2 },
  USDT: { leg: "usdt" as LegId, family: "evm", name: "Tether", decimals: 2 },
} as const;
export type P2pAsset = keyof typeof P2P_ASSETS;
export const P2P_ASSET_IDS = Object.keys(P2P_ASSETS) as [P2pAsset, ...P2pAsset[]];

export const PAYMENT_METHODS = [
  "Zelle",
  "Venmo",
  "Cash App",
  "PayPal",
  "Bank transfer (ACH)",
  "Wire transfer",
  "Cash in person",
] as const;

export const STATUS_LABEL: Record<string, string> = {
  open: "Waiting for payment",
  paid: "Buyer says paid",
  released: "Completed",
  cancelled: "Cancelled",
  disputed: "In dispute",
};

export function scoreTone(score: number) {
  if (score >= 80) return "text-primary";
  if (score >= 55) return "text-foreground";
  return "text-destructive";
}
