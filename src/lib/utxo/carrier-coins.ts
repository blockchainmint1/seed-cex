/**
 * Which TXC coins pay the network fee for a TSD (Omni) payment. Pure, tested.
 *
 * Mati's bug (Nov 23 2026): the old rule took the biggest coin first, so a ~0.00003 TXC
 * fee spent his whole 1,000 TXC coin and the change was "waiting for a block" for
 * minutes. Now the smallest single coin that covers the fee is used (a confirmed one
 * first), so big coins stay untouched whenever a small one will do. Only when no single
 * coin covers it are coins added biggest first, as before.
 */
export type CarrierCoin = { amount: number; height?: number };

const sats = (coins: number) => Math.round(coins * 1e8);

export function pickCarrierCoins<C extends CarrierCoin>(
  coins: C[],
  feeSatsFor: (inputs: number) => number,
  marginSats: number,
): { chosen: C[]; totalSats: number; feeSats: number; enough: boolean } {
  const single = feeSatsFor(1) + marginSats;
  const covering = coins.filter((c) => sats(c.amount) >= single);
  if (covering.length) {
    const confirmed = covering.filter((c) => (c.height ?? 0) > 0);
    const pool = confirmed.length ? confirmed : covering;
    const best = pool.reduce((a, b) => (sats(b.amount) < sats(a.amount) ? b : a));
    return { chosen: [best], totalSats: sats(best.amount), feeSats: feeSatsFor(1), enough: true };
  }
  const chosen: C[] = [];
  let totalSats = 0;
  let feeSats = 0;
  for (const c of [...coins].sort((a, b) => b.amount - a.amount)) {
    chosen.push(c);
    totalSats += sats(c.amount);
    feeSats = feeSatsFor(chosen.length);
    if (totalSats >= feeSats + marginSats) return { chosen, totalSats, feeSats, enough: true };
  }
  return { chosen, totalSats, feeSats, enough: false };
}
