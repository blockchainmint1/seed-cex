import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/ticker/price")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api/v1.server")).apiPreflight(),
      GET: async ({ request }) => {
        const { resolveSymbol, buildPrices, publicJson, apiError, ERR, symbolOf } = await import(
          "@/lib/api/v1.server"
        );
        const { fetchStats } = await import("@/lib/market.server");
        const url = new URL(request.url);
        const raw = url.searchParams.get("symbol");
        if (!raw) return publicJson(await buildPrices(), 5);
        const pair = resolveSymbol(raw);
        if (!pair) return apiError(ERR.BAD_SYMBOL, "Invalid symbol", 400);
        const stats = await fetchStats(pair.id);
        return publicJson({ symbol: symbolOf(pair), price: (stats.last ?? 0).toFixed(8) }, 5);
      },
    },
  },
});
