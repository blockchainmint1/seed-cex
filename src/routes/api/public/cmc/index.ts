import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cmc/")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/cmc-api.server");
        return corsPreflight();
      },
      GET: async () => {
        const { marketJson, cmcPair } = await import("@/lib/cmc-api.server");
        const { PAIRS } = await import("@/lib/chains");
        const markets = PAIRS.map(cmcPair);
        return marketJson({
          exchange: "Seeds",
          spec: "CoinMarketCap Ideal API v1.1",
          markets,
          endpoints: {
            assets: "/api/public/cmc/assets",
            summary: "/api/public/cmc/summary",
            ticker: "/api/public/cmc/ticker",
            orderbook: "/api/public/cmc/orderbook/{market_pair}?depth=100&level=2",
            trades: "/api/public/cmc/trades/{market_pair}?limit=100",
          },
        });
      },
    },
  },
});
