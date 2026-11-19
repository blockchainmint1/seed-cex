import { createServerFn } from "@tanstack/react-start";

/** Public reference prices from CoinMarketCap for the assets Seeds supports (one shared copy a minute). */
export const getReferencePrices = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchQuotes, TRACKED } = await import("./cmc.server");
  const { shared } = await import("./cache/shared-cache.server");
  const { CACHE_TIMES } = await import("./cache/shared-cache-rules");
  return shared("cmc:quotes", { ...CACHE_TIMES.referencePrices, good: (q) => q.online }, () => fetchQuotes(TRACKED));
});

/** Live CMC-compatible market summary for all configured pairs (one shared copy every few seconds). */
export const getCmcSummary = createServerFn({ method: "GET" }).handler(async () => {
  const { sharedSummary } = await import("./cmc-api.server");
  return sharedSummary();
});
