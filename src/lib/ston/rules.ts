import { swapMinimum } from "@/lib/pockets/ton-jetton";

/**
 * The on-chain "at least" for a TON → USD₮ swap (audit TA2). The browser's shown amount is only used
 * to refuse a price that moved more than 1%; the signed minimum never drops below 99% of Seeds' own
 * fresh quote, so a tampered or buggy "shown" value (e.g. 1) can't sign a near-zero minimum.
 */
export function stonMinimum(shown: bigint, fresh: bigint): bigint {
  if (shown <= 0n || fresh <= 0n) throw new Error("Get a fresh price first.");
  const fromShown = swapMinimum(shown);
  if (fresh < fromShown) throw new Error("The price moved more than 1% since you looked. Nothing was sent — check the new price.");
  const fromFresh = swapMinimum(fresh);
  return fromFresh > fromShown ? fromFresh : fromShown;
}

/** Dollar value of a TON offer for the swap caps (audit TA3); null when TON can't be priced. */
export function tonSwapUsd(offerNanoton: bigint, tonUsd: number | null | undefined): number | null {
  if (!tonUsd || !Number.isFinite(tonUsd) || tonUsd <= 0) return null;
  return Math.round((Number(offerNanoton) / 1e9) * tonUsd * 100) / 100;
}
