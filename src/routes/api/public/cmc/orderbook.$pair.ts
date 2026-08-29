import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cmc/orderbook/$pair")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/cmc-api.server");
        return corsPreflight();
      },
      GET: async ({ request, params }) => {
        const { resolvePair, toOrderBook, marketJson } = await import("@/lib/cmc-api.server");
        const pair = resolvePair(params.pair);
        if (!pair) return marketJson({ error: "Unknown market_pair" }, 404);

        const url = new URL(request.url);
        const depth = Math.min(Math.max(Number(url.searchParams.get("depth") ?? 100) || 100, 0), 500);
        const levelRaw = Number(url.searchParams.get("level") ?? 2);
        const level = (levelRaw === 1 || levelRaw === 3 ? levelRaw : 2) as 1 | 2 | 3;

        return marketJson(await toOrderBook(pair, depth, level));
      },
    },
  },
});
