import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/myTrades")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api/v1.server")).apiPreflight(),
      GET: async ({ request }) => {
        const { authenticate } = await import("@/lib/api/auth.server");
        const { privateJson, resolveSymbol, apiError, ERR } = await import("@/lib/api/v1.server");
        const auth = await authenticate(request, { scope: "read", weight: 10 });
        if (!auth.ok) return auth.response;

        const raw = auth.caller.params.get("symbol");
        const pair = raw ? resolveSymbol(raw) : null;
        if (raw && !pair) return apiError(ERR.BAD_SYMBOL, "Invalid symbol", 400);
        const limit = Math.min(Math.max(Number(auth.caller.params.get("limit") ?? 500) || 500, 1), 1000);

        const { apiMyTrades } = await import("@/lib/api/private.server");
        return privateJson(await apiMyTrades(auth.caller.userId, pair, limit));
      },
    },
  },
});
