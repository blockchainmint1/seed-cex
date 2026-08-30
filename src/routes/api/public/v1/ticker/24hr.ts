import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/ticker/24hr")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api/v1.server")).apiPreflight(),
      GET: async ({ request }) => {
        const { resolveSymbol, build24hr, buildAll24hr, publicJson, apiError, ERR } = await import(
          "@/lib/api/v1.server"
        );
        const url = new URL(request.url);
        const raw = url.searchParams.get("symbol");
        if (!raw) return publicJson(await buildAll24hr(), 5);
        const pair = resolveSymbol(raw);
        if (!pair) return apiError(ERR.BAD_SYMBOL, "Invalid symbol", 400);
        return publicJson(await build24hr(pair), 5);
      },
    },
  },
});
