import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api/v1.server")).apiPreflight(),
      GET: async () => {
        const { publicJson } = await import("@/lib/api/v1.server");
        return publicJson({
          exchange: "Seeds",
          version: "v1",
          custody: "non-custodial",
          docs: "/api-docs",
          openapi: "/api/public/v1/openapi.json",
          public: {
            ping: "/api/public/v1/ping",
            time: "/api/public/v1/time",
            exchangeInfo: "/api/public/v1/exchangeInfo",
            depth: "/api/public/v1/depth?symbol=TXCUSDC&limit=100",
            trades: "/api/public/v1/trades?symbol=TXCUSDC&limit=500",
            klines: "/api/public/v1/klines?symbol=TXCUSDC&interval=1m&limit=500",
            ticker24hr: "/api/public/v1/ticker/24hr",
            tickerPrice: "/api/public/v1/ticker/price",
            stream: "/api/public/v1/stream?symbol=TXCUSDC&streams=ticker,depth,trade",
          },
          signed: {
            account: "GET /api/public/v1/account",
            openOrders: "GET /api/public/v1/openOrders",
            allOrders: "GET /api/public/v1/allOrders",
            myTrades: "GET /api/public/v1/myTrades",
            newOrder: "POST /api/public/v1/order",
            cancelOrder: "DELETE /api/public/v1/order",
          },
          compat: {
            coinmarketcap: "/api/public/cmc",
          },
        }, 60);
      },
    },
  },
});
