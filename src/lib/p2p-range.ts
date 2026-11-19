/**
 * The trade range buyers see on a P2P sell ad (pure, tested; no I/O).
 *
 * A seller picks a min and max, but they can only sell what's actually free in
 * their HME trading pocket (balance minus coins already reserved for open trades).
 * When the pocket covers less than the max, the max buyers see is reduced to what
 * it covers; when it can't cover the min, the ad stops showing until funds arrive.
 * Buy ads (the ad owner pays cash) are never reduced.
 */
export type OfferRange = {
  min: number;
  /** Largest trade a buyer can open right now, in dollars (whole cents, rounded down). */
  max: number;
  /** True when the pocket covers less than the seller's own max. */
  reduced: boolean;
  /** False when the pocket can't cover even the min: the ad is hidden from buyers. */
  live: boolean;
  /** Coins the seller would need to add to offer their full max (0 when covered). */
  shortCoins: number;
};

const cents = (n: number) => Math.floor(n * 100 + 1e-6) / 100;

export function offerRange(p: { side: "sell" | "buy"; minFiat: number; maxFiat: number; available: number; price: number }): OfferRange {
  const min = p.minFiat;
  if (p.side === "buy") return { min, max: p.maxFiat, reduced: false, live: p.maxFiat >= min, shortCoins: 0 };
  const free = Number.isFinite(p.available) && p.available > 0 ? p.available : 0;
  const coverUsd = Number.isFinite(p.price) && p.price > 0 ? cents(free * p.price) : 0;
  const max = Math.min(p.maxFiat, coverUsd);
  const reduced = max < p.maxFiat;
  const shortCoins = reduced && p.price > 0 ? p.maxFiat / p.price - free : 0;
  return { min, max, reduced, live: max >= min && max > 0, shortCoins: Math.max(0, shortCoins) };
}
