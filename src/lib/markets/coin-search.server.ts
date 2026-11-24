/** CoinMarketCap reads for /research. Read-only, through the shared display cache. */
import { shared } from "@/lib/cache/shared-cache.server";
import { parseProfile, type CoinProfile } from "./coin-research";
import type { CoinEntry } from "./coin-search";

async function cmc<T>(path: string): Promise<T> {
  const key = process.env.CMC_API;
  if (!key) throw new Error("CoinMarketCap isn't set up.");
  const r = await fetch("https://pro-api.coinmarketcap.com" + path, { headers: { "X-CMC_PRO_API_KEY": key, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) { console.error("[coin-search] CoinMarketCap", path.split("?")[0], r.status); throw new Error("CoinMarketCap didn't answer."); }
  return (await r.json()) as T;
}

/** Top 5,000 active coins by rank, refreshed daily (one call). */
export function coinList(): Promise<CoinEntry[]> {
  return shared("research:coin-list", { freshMs: 24 * 3_600_000, maxStaleMs: 14 * 24 * 3_600_000, good: (v) => v.length > 500 }, async () => {
    const j = await cmc<{ data?: { id: number; name: string; symbol: string; rank?: number | null }[] }>(
      "/v1/cryptocurrency/map?listing_status=active&sort=cmc_rank&limit=5000",
    );
    return (j.data ?? []).map((c) => [c.id, String(c.name).slice(0, 60), String(c.symbol).slice(0, 15), c.rank ?? null] as CoinEntry);
  });
}

export function anyCoinProfile(id: number): Promise<CoinProfile | null> {
  return shared(`research:any:${id}`, { freshMs: 5 * 60_000, maxStaleMs: 24 * 3_600_000, good: (v) => v != null }, async () => {
    const [info, quotes] = await Promise.all([
      cmc<{ data?: Record<string, unknown> }>(`/v2/cryptocurrency/info?id=${id}&aux=urls,logo,description,tags,date_added`),
      cmc<{ data?: Record<string, unknown> }>(`/v2/cryptocurrency/quotes/latest?id=${id}`),
    ]);
    return parseProfile(id, info.data?.[id], quotes.data?.[id], null);
  });
}
