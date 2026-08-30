import { createServerFn } from "@tanstack/react-start";
import { fetchQuotes } from "./cmc.server";
import { allSnapshots, toSummary } from "./cmc-api.server";

const TRACKED = ["TXC", "USDC", "USDT", "ETH", "BNB"];

/** Public reference prices from CoinMarketCap for the assets Seeds supports. */
export const getReferencePrices = createServerFn({ method: "GET" }).handler(async () => {
  return fetchQuotes(TRACKED);
});

/** Live CMC-compatible market summary for all configured pairs. */
export const getCmcSummary = createServerFn({ method: "GET" }).handler(async () => {
  const snaps = await allSnapshots();
  return toSummary(snaps);
});
