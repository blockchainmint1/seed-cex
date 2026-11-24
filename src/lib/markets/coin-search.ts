/**
 * Coin research search (pure, tested). Ranks CoinMarketCap's coin list against
 * what a member typed and says where a coin trades on Seeds, if anywhere.
 * Read-only: nothing here can move coins.
 */
import { THOR_MARKETS } from "./thor-markets";

/** [cmcId, name, symbol, cmcRank|null] — kept small so the full list fits the shared cache. */
export type CoinEntry = [id: number, name: string, symbol: string, rank: number | null];

export type SeedsPlace = { kind: "book"; to: string; label: string } | { kind: "market"; slug: string; label: string };

const HOME: Record<string, { to: string; label: string }> = {
  TXC: { to: "/trade/tsd-txc", label: "Trade TXC/TSD on Seeds" },
  ISK: { to: "/trade/isk-tsd", label: "Trade ISK/TSD on Seeds" },
  ZCU: { to: "/trade/zcu-tsd", label: "Trade ZCU/TSD on Seeds" },
};

/** Where this coin trades on Seeds. Matched by symbol AND name so a copycat token sharing a ticker doesn't link. */
export function seedsPlace(symbol: string, name: string): SeedsPlace | null {
  const s = symbol.toUpperCase();
  // HYPE: only the real Hyperliquid (by name) — many copycat "HYPE" tokens share the ticker.
  if (s === "HYPE") return name.toLowerCase() === "hyperliquid" ? { kind: "book", to: "/trade/hype-tsd", label: "Trade HYPE/TSD on Seeds" } : null;
  const home = HOME[s];
  if (home) return { kind: "book", ...home };
  const m = THOR_MARKETS.find((t) => t.base === s);
  if (!m) return null;
  const n = name.toLowerCase();
  const mn = m.name.toLowerCase();
  if (!(n === mn || (s === "ETH" && n === "ethereum"))) return null;
  return { kind: "market", slug: m.slug, label: `${m.base}/TSD on Seeds` };
}

/** Best matches first: exact symbol, then name/symbol prefix, then contains; ties by market-cap rank. */
export function searchCoins(list: readonly CoinEntry[], query: string, limit = 12): CoinEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  const scored: [number, CoinEntry][] = [];
  for (const c of list) {
    const name = c[1].toLowerCase();
    const sym = c[2].toLowerCase();
    let score = 0;
    if (sym === q) score = 4;
    else if (name === q) score = 4;
    else if (name.startsWith(q) || sym.startsWith(q)) score = 3;
    else if (q.length >= 3 && (name.includes(q) || sym.includes(q))) score = 1;
    if (score) scored.push([score, c]);
  }
  const rank = (c: CoinEntry) => c[3] ?? 1e9;
  scored.sort((a, b) => b[0] - a[0] || rank(a[1]) - rank(b[1]));
  return scored.slice(0, limit).map((s) => s[1]);
}
