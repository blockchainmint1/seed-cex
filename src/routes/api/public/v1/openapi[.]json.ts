import { createFileRoute } from "@tanstack/react-router";

const SIGNED_PARAMS = [
  { name: "timestamp", in: "query", required: true, schema: { type: "integer" }, description: "Unix ms" },
  { name: "recvWindow", in: "query", required: false, schema: { type: "integer", default: 5000, maximum: 60000 } },
  { name: "signature", in: "query", required: true, schema: { type: "string" }, description: "hex HMAC-SHA256" },
];

const symbolParam = {
  name: "symbol",
  in: "query",
  schema: { type: "string", example: "TXCUSDC" },
};

function spec(origin: string) {
  return {
    openapi: "3.0.3",
    info: {
      title: "Seeds Exchange API",
      version: "1.0.0",
      description:
        "Binance-compatible REST API for the Seeds non-custodial exchange. Trading settles directly between user wallets; API keys can read and trade but can never withdraw.",
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: {
        SeedsApiKey: { type: "apiKey", in: "header", name: "X-SEEDS-APIKEY" },
      },
    },
    paths: {
      "/api/public/v1/ping": { get: { summary: "Connectivity test", responses: { 200: { description: "OK" } } } },
      "/api/public/v1/time": { get: { summary: "Server time", responses: { 200: { description: "serverTime" } } } },
      "/api/public/v1/exchangeInfo": {
        get: { summary: "Symbols, filters, rate limits", responses: { 200: { description: "OK" } } },
      },
      "/api/public/v1/depth": {
        get: {
          summary: "Order book",
          parameters: [{ ...symbolParam, required: true }, { name: "limit", in: "query", schema: { type: "integer", default: 100 } }],
          responses: { 200: { description: "OK" } },
        },
      },
      "/api/public/v1/trades": {
        get: {
          summary: "Recent trades",
          parameters: [{ ...symbolParam, required: true }, { name: "limit", in: "query", schema: { type: "integer", default: 500 } }],
          responses: { 200: { description: "OK" } },
        },
      },
      "/api/public/v1/klines": {
        get: {
          summary: "OHLCV candles",
          parameters: [
            { ...symbolParam, required: true },
            { name: "interval", in: "query", schema: { type: "string", default: "1m" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 500 } },
          ],
          responses: { 200: { description: "Array of [openTime,open,high,low,close,volume,closeTime,quoteVolume,trades]" } },
        },
      },
      "/api/public/v1/ticker/24hr": {
        get: { summary: "24h ticker (all symbols when symbol omitted)", parameters: [symbolParam], responses: { 200: { description: "OK" } } },
      },
      "/api/public/v1/ticker/price": {
        get: { summary: "Last price", parameters: [symbolParam], responses: { 200: { description: "OK" } } },
      },
      "/api/public/v1/stream": {
        get: {
          summary: "SSE market stream (ticker, depth, trade)",
          parameters: [
            { ...symbolParam, required: true },
            { name: "streams", in: "query", schema: { type: "string", default: "ticker,depth,trade" } },
          ],
          responses: { 200: { description: "text/event-stream" } },
        },
      },
      "/api/public/v1/account": {
        get: {
          summary: "Account state and live trading authorizations",
          security: [{ SeedsApiKey: [] }],
          parameters: SIGNED_PARAMS,
          responses: { 200: { description: "OK" } },
        },
      },
      "/api/public/v1/openOrders": {
        get: { summary: "Open orders", security: [{ SeedsApiKey: [] }], parameters: [symbolParam, ...SIGNED_PARAMS], responses: { 200: { description: "OK" } } },
      },
      "/api/public/v1/allOrders": {
        get: { summary: "Order history", security: [{ SeedsApiKey: [] }], parameters: [symbolParam, ...SIGNED_PARAMS], responses: { 200: { description: "OK" } } },
      },
      "/api/public/v1/myTrades": {
        get: { summary: "Trade history with on-chain settlement legs", security: [{ SeedsApiKey: [] }], parameters: [symbolParam, ...SIGNED_PARAMS], responses: { 200: { description: "OK" } } },
      },
      "/api/public/v1/order": {
        get: {
          summary: "Query order",
          security: [{ SeedsApiKey: [] }],
          parameters: [{ name: "orderId", in: "query", required: true, schema: { type: "string" } }, ...SIGNED_PARAMS],
          responses: { 200: { description: "OK" } },
        },
        post: {
          summary: "New limit order (matches and settles on-chain inline)",
          security: [{ SeedsApiKey: [] }],
          parameters: [
            { ...symbolParam, required: true },
            { name: "side", in: "query", required: true, schema: { type: "string", enum: ["BUY", "SELL"] } },
            { name: "type", in: "query", schema: { type: "string", enum: ["LIMIT"], default: "LIMIT" } },
            { name: "timeInForce", in: "query", schema: { type: "string", enum: ["GTC"], default: "GTC" } },
            { name: "price", in: "query", required: true, schema: { type: "number" } },
            { name: "quantity", in: "query", required: true, schema: { type: "number" } },
            ...SIGNED_PARAMS,
          ],
          responses: { 200: { description: "OK" } },
        },
        delete: {
          summary: "Cancel order",
          security: [{ SeedsApiKey: [] }],
          parameters: [{ name: "orderId", in: "query", required: true, schema: { type: "string" } }, ...SIGNED_PARAMS],
          responses: { 200: { description: "OK" } },
        },
      },
    },
  };
}

export const Route = createFileRoute("/api/public/v1/openapi.json")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api/v1.server")).apiPreflight(),
      GET: async ({ request }) => {
        const { publicJson } = await import("@/lib/api/v1.server");
        return publicJson(spec(new URL(request.url).origin), 300);
      },
    },
  },
});
