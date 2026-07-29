import { createServerFn } from "@tanstack/react-start";
import { fetchQuotes } from "./cmc.server";

const TRACKED = ["TXC", "USDC", "USDT", "ETH", "BNB"];

/** Public reference prices from CoinMarketCap for the assets Seeds supports. */
export const getReferencePrices = createServerFn({ method: "GET" }).handler(async () => {
  return fetchQuotes(TRACKED);
});
