import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cmc/trades/$pair")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/cmc-api.server");
        return corsPreflight();
      },
      GET: async ({ request, params }) => {
        const { resolvePair, toTrades, marketJson } = await import("@/lib/cmc-api.server");
        const pair = resolvePair(params.pair);
        if (!pair) return marketJson({ error: "Unknown market_pair" }, 404);

        const url = new URL(request.url);
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100) || 100, 1), 500);
        return marketJson(await toTrades(pair, limit));
      },
    },
  },
});
