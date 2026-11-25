/**
 * CoinMarketCap price discovery.
 *
 * Server-only: the CMC key never reaches the browser. Quotes are cached in
 * memory for a minute so a busy order book doesn't burn API credits.
 */

const CMC_URL = "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest";
const TTL_MS = 60_000;
// TON's CMC ticker has changed; ticker lookup can resolve an unrelated "Ton" stock.
const TON_CMC_ID = 11419;

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

/** One shared symbol set — the quote cache is not keyed by symbols. */
export const TRACKED = ["TXC", "USDC", "USDT", "ETH", "BNB", "BTC", "LTC", "DOGE", "BCH", "XRP", "TRX", "SOL", "ZEC", "XLM", "TON", "SUI"];

let cache: { at: number; key: string; value: QuoteSet } | null = null;

export async function fetchQuotes(symbols: string[]): Promise<QuoteSet> {
  const now = Date.now();
  const symbolKey = [...new Set(symbols)].sort().join(",");
  if (cache && cache.key === symbolKey && now - cache.at < TTL_MS) return cache.value;

  const key = process.env['CMC_API'];
  const empty: QuoteSet = {
    quotes: [],
    txcUsd: null,
    online: false,
    fetchedAt: new Date().toISOString(),
  };
  if (!key) return empty;

  try {
    const read = async (query: string): Promise<Record<string, any | any[]>> => {
      try {
        const res = await fetch(`${CMC_URL}?${query}&convert=USD`, {
          headers: { "X-CMC_PRO_API_KEY": key, Accept: "application/json" },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) {
          console.error(`CMC quotes failed [${res.status}]`);
          return {};
        }
        const json = (await res.json()) as { data?: Record<string, any | any[]> };
        return json.data ?? {};
      } catch {
        console.error("CMC quote request failed");
        return {};
      }
    };
    const ordinary = symbols.filter((sym) => sym !== "TON");
    const [data, tonData] = await Promise.all([
      ordinary.length ? read(`symbol=${encodeURIComponent(ordinary.join(","))}`) : Promise.resolve<Record<string, any | any[]>>({}),
      symbols.includes("TON") ? read(`id=${TON_CMC_ID}`) : Promise.resolve<Record<string, any | any[]>>({}),
    ]);

    const quotes: Quote[] = [];
    for (const sym of symbols) {
      const raw = sym === "TON" ? tonData[String(TON_CMC_ID)] : data[sym];
      const entry = Array.isArray(raw) ? raw[0] : raw;
      if (sym === "TON" && entry?.id !== TON_CMC_ID) continue;
      const usd = entry?.quote?.USD;
      if (!entry || !usd) continue;
      const price = Number(usd.price);
      if (!Number.isFinite(price) || price <= 0) continue;
      quotes.push({
        symbol: sym === "TON" ? "TON" : (entry.symbol ?? sym),
        name: entry.name ?? sym,
        price,
        change1h: usd.percent_change_1h ?? null,
        change24h: usd.percent_change_24h ?? null,
        change7d: usd.percent_change_7d ?? null,
        volume24h: usd.volume_24h ?? null,
        marketCap: usd.market_cap ?? null,
        updatedAt: usd.last_updated ?? null,
      });
    }

    quotes.push(...(await fetchHexPulseQuotes()));

    const txc = quotes.find((q) => q.symbol === "TXC")?.price ?? null;
    const usdc = quotes.find((q) => q.symbol === "USDC")?.price ?? null;
    const value: QuoteSet = {
      quotes,
      // USDC is pegged but not exactly $1 — express TXC in USDC terms.
      txcUsd: txc != null ? (usdc && usdc > 0 ? txc / usdc : txc) : null,
      online: quotes.length > 0,
      fetchedAt: new Date().toISOString(),
    };
    cache = { at: now, key: symbolKey, value };
    return value;
  } catch (err) {
    console.error("CMC quotes error", err);
    return empty;
  }
}

/* ------------------------- HEX and PulseChain prices ------------------------ */

/**
 * PLS, HEX (Ethereum) and pHEX (HEX on PulseChain) come from CoinGecko, with
 * DexScreener as backup. CoinMarketCap is not used for these: its PulseChain HEX
 * price was several times off the live PulseX price when checked (Nov 2026),
 * and looking up "HEX" or "PLS" by symbol there can return the wrong coin.
 */
const HEX_PULSE = [
  { symbol: "PLS", name: "PulseChain", gecko: "pulsechain", dexChain: "pulsechain", token: "0xA1077a294dDE1B09bB078844df40758a5D0f9a27" /* WPLS */ },
  { symbol: "HEX", name: "HEX", gecko: "hex", dexChain: "ethereum", token: "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39" },
  { symbol: "pHEX", name: "HEX (PulseChain)", gecko: "hex-pulsechain", dexChain: "pulsechain", token: "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39" },
  // HYPE: CoinGecko id is unambiguous; DexScreener backup reads WHYPE on HyperEVM (never Solana copycats).
  { symbol: "HYPE", name: "Hyperliquid", gecko: "hyperliquid", dexChain: "hyperevm", token: "0x5555555555555555555555555555555555555555" },
  { symbol: "AVAX", name: "Avalanche", gecko: "avalanche-2", dexChain: "avalanche", token: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7" /* WAVAX */ },
] as const;

function quoteOf(c: (typeof HEX_PULSE)[number], price: number, change24h: number | null, volume24h: number | null, marketCap: number | null): Quote {
  return { symbol: c.symbol, name: c.name, price, change1h: null, change24h, change7d: null, volume24h, marketCap, updatedAt: new Date().toISOString() };
}

async function fetchHexPulseQuotes(): Promise<Quote[]> {
  const out: Quote[] = [];
  try {
    const ids = HEX_PULSE.map((c) => c.gecko).join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(6000) },
    );
    if (res.ok) {
      const j = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number; usd_24h_vol?: number; usd_market_cap?: number }>;
      for (const c of HEX_PULSE) {
        const r = j[c.gecko];
        if (r?.usd && r.usd > 0) out.push(quoteOf(c, r.usd, r.usd_24h_change ?? null, r.usd_24h_vol ?? null, r.usd_market_cap ?? null));
      }
    }
  } catch (err) {
    console.error("CoinGecko HEX/PLS prices failed", err);
  }
  const missing = HEX_PULSE.filter((c) => !out.some((q) => q.symbol === c.symbol));
  await Promise.all(missing.map(async (c) => {
    try {
      const res = await fetch(`https://api.dexscreener.com/tokens/v1/${c.dexChain}/${c.token}`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return;
      const pairs = (await res.json()) as Array<{ baseToken?: { address?: string }; priceUsd?: string; liquidity?: { usd?: number }; volume?: { h24?: number }; priceChange?: { h24?: number } }>;
      // Deepest pool where this coin is the base token, and only with real liquidity behind it.
      const best = pairs
        .filter((p) => p.baseToken?.address?.toLowerCase() === c.token.toLowerCase() && (p.liquidity?.usd ?? 0) >= 25_000)
        .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
      const price = Number(best?.priceUsd);
      if (best && price > 0) out.push(quoteOf(c, price, best.priceChange?.h24 ?? null, best.volume?.h24 ?? null, null));
    } catch (err) {
      console.error(`DexScreener ${c.symbol} price failed`, err);
    }
  }));
  return out;
}
