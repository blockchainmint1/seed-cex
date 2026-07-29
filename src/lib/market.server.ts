import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Publishable-key client for public market data (order book + trade tape).
 * Never the service role — the book is behind narrow public SELECT policies.
 */
function publicClient() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(process.env.SUPABASE_URL!, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export type BookLevel = { price: number; amount: number; total: number };
export type OrderBook = {
  pair: string;
  bids: BookLevel[];
  asks: BookLevel[];
  spread: number | null;
  mid: number | null;
};

function aggregate(rows: Array<{ price: string | number; amount: string | number; filled: string | number }>) {
  const byPrice = new Map<number, number>();
  for (const r of rows) {
    const price = Number(r.price);
    const remaining = Number(r.amount) - Number(r.filled);
    if (remaining <= 0) continue;
    byPrice.set(price, (byPrice.get(price) ?? 0) + remaining);
  }
  return byPrice;
}

export async function fetchOrderBook(pair: string): Promise<OrderBook> {
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("orders")
    .select("side, price, amount, filled")
    .eq("pair", pair)
    .in("status", ["open", "partial"]);

  if (error) {
    console.error("[market] order book read failed", error);
    return { pair, bids: [], asks: [], spread: null, mid: null };
  }

  const rows = data ?? [];
  const bidMap = aggregate(rows.filter((r) => r.side === "buy"));
  const askMap = aggregate(rows.filter((r) => r.side === "sell"));

  const build = (map: Map<number, number>, desc: boolean): BookLevel[] => {
    const levels = [...map.entries()].sort((a, b) => (desc ? b[0] - a[0] : a[0] - b[0]));
    let running = 0;
    return levels.slice(0, 12).map(([price, amount]) => {
      running += amount;
      return { price, amount, total: running };
    });
  };

  const bids = build(bidMap, true);
  const asks = build(askMap, false);
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;

  return {
    pair,
    bids,
    asks,
    spread: bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null,
    mid: bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null,
  };
}

export type TapeEntry = {
  id: string;
  side: "buy" | "sell";
  price: number;
  amount: number;
  createdAt: string;
};

export async function fetchTape(pair: string, limit = 30): Promise<TapeEntry[]> {
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("trades")
    .select("id, side, price, amount, created_at")
    .eq("pair", pair)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[market] tape read failed", error);
    return [];
  }

  return (data ?? []).map((t) => ({
    id: t.id,
    side: t.side,
    price: Number(t.price),
    amount: Number(t.amount),
    createdAt: t.created_at,
  }));
}

export type MarketStats = {
  last: number | null;
  changePct: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24h: number;
};

export async function fetchStats(pair: string): Promise<MarketStats> {
  const tape = await fetchTape(pair, 200);
  if (!tape.length) {
    return { last: null, changePct: null, high24h: null, low24h: null, volume24h: 0 };
  }
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recent = tape.filter((t) => new Date(t.createdAt).getTime() >= cutoff);
  const window = recent.length ? recent : tape;
  const prices = window.map((t) => t.price);
  const last = window[0].price;
  const first = window[window.length - 1].price;

  return {
    last,
    changePct: first ? ((last - first) / first) * 100 : null,
    high24h: Math.max(...prices),
    low24h: Math.min(...prices),
    volume24h: window.reduce((sum, t) => sum + t.amount, 0),
  };
}

export type Candle = { t: string; price: number };

export async function fetchSeries(pair: string): Promise<Candle[]> {
  const tape = await fetchTape(pair, 120);
  return tape
    .slice()
    .reverse()
    .map((t) => ({ t: t.createdAt, price: t.price }));
}
