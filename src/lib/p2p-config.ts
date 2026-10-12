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

/** Anti-scam tips shown in the trade room for each payment method. */
export const METHOD_TIPS: Record<string, string[]> = {
  Zelle: ["Zelle can't be reversed by the sender, but check the name matches the trader.", "Never accept 'Zelle pending' emails — check your actual bank app."],
  Venmo: ["Venmo payments can be charged back. Use 'Friends & Family' and confirm the money is in your balance.", "Ignore screenshots — open the Venmo app."],
  "Cash App": ["Confirm the payment in the Cash App activity tab, not a screenshot.", "Watch for fake 'pending' emails from look-alike addresses."],
  PayPal: ["PayPal Goods & Services can be reversed for months. Friends & Family only.", "Check the payment shows 'Completed' in your PayPal account."],
  "Bank transfer (ACH)": ["ACH can bounce for days. Wait until the money is no longer 'pending'.", "The sender's name should match the trader's."],
  "Wire transfer": ["Wires are final once received. Confirm with your bank, not an email."],
  "Cash in person": ["Meet in a public place — bank lobbies or police-station safe-trade zones are best.", "Count the cash and check bills before releasing."],
};
export const GENERAL_TIPS = [
  "Seeds will never ask you to pay or release outside this trade room.",
  "Keep every message here — the jury can only see this chat.",
  "Seller: never release until the money is actually in your account.",
];
