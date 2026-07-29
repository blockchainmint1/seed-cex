/**
 * CoinMarketCap price discovery.
 *
 * Server-only: the CMC key never reaches the browser. Quotes are cached in
 * memory for a minute so a busy order book doesn't burn API credits.
 */

const CMC_URL = "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest";
const TTL_MS = 60_000;

export type Quote = {
  symbol: string;
  name: string;
  price: number;
  change1h: number | null;
  change24h: number | null;
  change7d: number | null;
  volume24h: number | null;
  marketCap: number | null;
  updatedAt: string | null;
};

export type QuoteSet = {
  quotes: Quote[];
  /** USDC-quoted reference price for the USDC_TXC pair, if both legs resolved. */
  txcUsd: number | null;
  online: boolean;
  fetchedAt: string;
};

let cache: { at: number; value: QuoteSet } | null = null;

export async function fetchQuotes(symbols: string[]): Promise<QuoteSet> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.value;

  const key = process.env.CMC_API;
  const empty: QuoteSet = {
    quotes: [],
    txcUsd: null,
    online: false,
    fetchedAt: new Date().toISOString(),
  };
  if (!key) return empty;

  try {
    const res = await fetch(
      `${CMC_URL}?symbol=${encodeURIComponent(symbols.join(","))}&convert=USD`,
      { headers: { "X-CMC_PRO_API_KEY": key, Accept: "application/json" } },
    );
    if (!res.ok) {
      console.error(`CMC quotes failed [${res.status}]: ${await res.text()}`);
      return empty;
    }
    const json = (await res.json()) as {
      data?: Record<string, any | any[]>;
    };

    const quotes: Quote[] = [];
    for (const sym of symbols) {
      const raw = json.data?.[sym];
      const entry = Array.isArray(raw) ? raw[0] : raw;
      const usd = entry?.quote?.USD;
      if (!entry || !usd) continue;
      quotes.push({
        symbol: entry.symbol ?? sym,
        name: entry.name ?? sym,
        price: Number(usd.price),
        change1h: usd.percent_change_1h ?? null,
        change24h: usd.percent_change_24h ?? null,
        change7d: usd.percent_change_7d ?? null,
        volume24h: usd.volume_24h ?? null,
        marketCap: usd.market_cap ?? null,
        updatedAt: usd.last_updated ?? null,
      });
    }

    const txc = quotes.find((q) => q.symbol === "TXC")?.price ?? null;
    const usdc = quotes.find((q) => q.symbol === "USDC")?.price ?? null;
    const value: QuoteSet = {
      quotes,
      // USDC is pegged but not exactly $1 — express TXC in USDC terms.
      txcUsd: txc != null ? (usdc && usdc > 0 ? txc / usdc : txc) : null,
      online: quotes.length > 0,
      fetchedAt: new Date().toISOString(),
    };
    cache = { at: now, value };
    return value;
  } catch (err) {
    console.error("CMC quotes error", err);
    return empty;
  }
}
