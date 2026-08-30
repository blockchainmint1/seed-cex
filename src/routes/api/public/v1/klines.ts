import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/klines")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api/v1.server")).apiPreflight(),
      GET: async ({ request }) => {
        const { resolveSymbol, buildKlines, publicJson, apiError, ERR, INTERVALS } = await import(
          "@/lib/api/v1.server"
        );
        const url = new URL(request.url);
        const pair = resolveSymbol(url.searchParams.get("symbol"));
        if (!pair) return apiError(ERR.BAD_SYMBOL, "Invalid symbol", 400);
        const interval = url.searchParams.get("interval") ?? "1m";
        if (!INTERVALS[interval]) {
          return apiError(ERR.ILLEGAL_CHARS, `Invalid interval. Supported: ${Object.keys(INTERVALS).join(", ")}`, 400);
        }
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 500) || 500, 1), 1000);
        return publicJson(await buildKlines(pair, interval, limit), 5);
      },
    },
  },
});
