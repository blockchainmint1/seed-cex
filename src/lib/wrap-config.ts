/**
 * Wrap desk — client-safe config.
 *
 * Seeds does NOT issue wrapped assets. A separate reserve-backed issuer
 * (the TSD Swap service) holds the reserve, owns the Omni issuer key, and
 * publishes its own proof-of-reserves. Seeds is a partner API client:
 * it opens wrap/unwrap orders on the user's behalf and mirrors their status.
 *
 * This split is deliberate. Two apps holding mint authority over reserve
 * assets means two reserve ledgers and two things to audit; one issuer means
 * one seed, one cold vault, one attestation feed.
 */

export type WrapAssetDef = {
  /** Native asset the user actually holds, e.g. BTC. */
  baseSymbol: string;
  /** Tradable wrapped asset on TEXITcoin/Omni, e.g. wBTC. */
  wrappedSymbol: string;
  name: string;
  decimals: number;
  /** Human note on where the native coin sits while wrapped. */
  custodyNote: string;
  /** Block explorer for the *native* chain, address view. */
  nativeExplorer: string;
  /** Confirmations the issuer waits for before minting. */
  confirmations: number;
  /** Smallest wrap the desk accepts, in native units. */
  minAmount: number;
};

export const WRAP_ASSETS: WrapAssetDef[] = [
  {
    baseSymbol: "BTC",
    wrappedSymbol: "wBTC",
    name: "Bitcoin",
    decimals: 8,
    custodyNote:
      "Native BTC is held in the issuer's cold reserve while wBTC circulates. Redeemable 1:1 at any time.",
    nativeExplorer: "https://mempool.space/address/",
    confirmations: 2,
    minAmount: 0.0005,
  },
];

export function getWrapAsset(baseSymbol: string): WrapAssetDef {
  const found = WRAP_ASSETS.find(
    (a) => a.baseSymbol.toLowerCase() === baseSymbol.toLowerCase(),
  );
  if (!found) throw new Error(`No wrap desk for ${baseSymbol}`);
  return found;
}

export const WRAP_BASE_SYMBOLS = WRAP_ASSETS.map((a) => a.baseSymbol) as [
  string,
  ...string[],
];

export type WrapDirection = "wrap" | "unwrap";

export type WrapStatus =
  | "created"
  | "awaiting_deposit"
  | "deposit_detected"
  | "deposit_confirmed"
  | "processing"
  | "complete"
  | "failed"
  | "expired";

export const WRAP_STATUS_LABELS: Record<WrapStatus, string> = {
  created: "Created",
  awaiting_deposit: "Awaiting deposit",
  deposit_detected: "Deposit seen",
  deposit_confirmed: "Deposit confirmed",
  processing: "Issuing",
  complete: "Complete",
  failed: "Failed",
  expired: "Expired",
};

export function isTerminalWrapStatus(status: WrapStatus): boolean {
  return status === "complete" || status === "failed" || status === "expired";
}
