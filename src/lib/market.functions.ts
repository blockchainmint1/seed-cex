import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PAIRS } from "./chains";

const PAIR = "TSD_TXC";
const pairInput = (input: unknown) =>
  z.object({ pair: z.string().trim().max(24).default(PAIR) }).parse(input ?? {});

/**
 * Public market reads share one recent copy for every visitor (src/lib/cache).
 * Only listed pairs are cached, so made-up pair names can't fill the cache.
 */
async function sharedRead<T>(kind: "book" | "tape" | "stats" | "series", pair: string, load: () => Promise<T>): Promise<T> {
  if (!PAIRS.some((p) => p.id === pair)) return load();
  const { shared } = await import("./cache/shared-cache.server");
  const { CACHE_TIMES } = await import("./cache/shared-cache-rules");
  return shared(`market:${kind}:${pair}`, CACHE_TIMES[kind], load);
}

export const getOrderBook = createServerFn({ method: "GET" })
  .inputValidator(pairInput)
  .handler(async ({ data }) => {
    const { fetchOrderBook } = await import("./market.server");
    return sharedRead("book", data.pair, () => fetchOrderBook(data.pair));
  });

export const getTape = createServerFn({ method: "GET" })
  .inputValidator(pairInput)
  .handler(async ({ data }) => {
    const { fetchTape } = await import("./market.server");
    return sharedRead("tape", data.pair, () => fetchTape(data.pair));
  });

export const getMarketStats = createServerFn({ method: "GET" })
  .inputValidator(pairInput)
  .handler(async ({ data }) => {
    const { fetchStats } = await import("./market.server");
    return sharedRead("stats", data.pair, () => fetchStats(data.pair));
  });

export const getPriceSeries = createServerFn({ method: "GET" })
  .inputValidator(pairInput)
  .handler(async ({ data }) => {
    const { fetchSeries } = await import("./market.server");
    return sharedRead("series", data.pair, () => fetchSeries(data.pair));
  });

/** Public: TXC/TSD, ISK/TSD and ZCU/TSD rows for Primary markets, from Seeds' own books (one shared copy). */
export const getHomeCoinMarkets = createServerFn({ method: "GET" }).handler(async () => {
  const { shared } = await import("./cache/shared-cache.server");
  const { CACHE_TIMES } = await import("./cache/shared-cache-rules");
  return shared("market:home-coin-rows", CACHE_TIMES.summary, async () => {
    const { fetchOrderBook, fetchTape } = await import("./market.server");
    const { HOME_COIN_MARKETS, bookRow } = await import("./markets/primary-rows");
    const now = Date.now();
    return Promise.all(
      HOME_COIN_MARKETS.map(async (h) => {
        const [book, tape] = await Promise.all([fetchOrderBook(h.pairId), fetchTape(h.pairId, 500)]);
        return bookRow(h, tape, book, now);
      }),
    );
  });
});
