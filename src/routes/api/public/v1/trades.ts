import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/trades")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api/v1.server")).apiPreflight(),
      GET: async ({ request }) => {
        const { resolveSymbol, buildTrades, publicJson, apiError, ERR } = await import("@/lib/api/v1.server");
        const url = new URL(request.url);
        const pair = resolveSymbol(url.searchParams.get("symbol"));
        if (!pair) return apiError(ERR.BAD_SYMBOL, "Invalid symbol", 400);
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 500) || 500, 1), 1000);
        return publicJson(await buildTrades(pair, limit), 2);
      },
    },
  },
});
