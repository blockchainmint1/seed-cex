/**
 * TSD Bridge partner API (server only): the single TSD issuer converts TSD <-> Ethereum
 * USDC 1:1. Seeds is an API client with its own key (WRAP_ISSUER_API_KEY); it never
 * mints or holds reserves. Every answer is checked by tsd-route.ts before any coin moves.
 */
import { issuerFetch, wrapDeskConfigured } from "@/lib/wrap.server";
import { BRIDGE_CHAIN, type BridgeOrder } from "./tsd-route";

export type BridgeSettings = { live: boolean; minAmount: number; maxAmount: number; redeemFeeBps: number; mintFeeBps: number };

let cache: { at: number; value: BridgeSettings } | null = null;

export function tsdBridgeConfigured(): boolean {
  return wrapDeskConfigured();
}

/** Live switch, limits and the fees for Seeds' account (cached 60s). */
export async function bridgeSettings(): Promise<BridgeSettings> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  const [s, a] = await Promise.all([
    issuerFetch<{ live?: boolean; minAmount?: number; maxAmount?: number; redeemFeeBps?: number }>("/api/public/v1/cashout/settings"),
    issuerFetch<{ assets?: Array<{ symbol: string; mintFeeBps?: number; live?: boolean }> }>("/api/public/v1/stables/assets"),
  ]);
  const tsd = a.assets?.find((x) => x.symbol === "TSD");
  const value: BridgeSettings = {
    live: Boolean(s.live) && tsd?.live !== false,
    minAmount: Number(s.minAmount ?? 10),
    maxAmount: Number(s.maxAmount ?? 0),
    redeemFeeBps: Number(s.redeemFeeBps ?? 100),
    mintFeeBps: Number(tsd?.mintFeeBps ?? 100),
  };
  cache = { at: Date.now(), value };
  return value;
}

/** TSD -> USDC: TSD Bridge gives a one-time TSD deposit address and pays USDC to `payout`. */
export function createRedeemOrder(p: { amount: number; payout: string; refund: string; reference: string }) {
  return issuerFetch<BridgeOrder>("/api/public/v1/cashout/orders", {
    method: "POST",
    body: { amount: p.amount, payoutAddress: p.payout, refundAddress: p.refund, chain: BRIDGE_CHAIN, source: `seeds:${p.reference}`.slice(0, 60) },
  });
}

/** USDC -> TSD: TSD Bridge gives a one-time Ethereum deposit address and issues TSD to `recipient`. */
export function createMintOrder(p: { amount: number; recipient: string; reference: string }) {
  return issuerFetch<BridgeOrder>("/api/public/v1/stables/orders", {
    method: "POST",
    body: { asset: "TSD", direction: "mint", chain: BRIDGE_CHAIN, token: "USDC", recipient: p.recipient, amount: p.amount, source: `seeds:${p.reference}`.slice(0, 60) },
  });
}

/** Read (and nudge forward) an order Seeds created. Works for both directions. */
export function getBridgeOrder(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Bad bridge order id");
  return issuerFetch<BridgeOrder>(`/api/public/v1/cashout/orders/${id}`);
}
