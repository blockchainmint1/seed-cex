import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/openOrders")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api/v1.server")).apiPreflight(),
      GET: async ({ request }) => {
        const { authenticate } = await import("@/lib/api/auth.server");
        const { privateJson, resolveSymbol, apiError, ERR } = await import("@/lib/api/v1.server");
        const auth = await authenticate(request, { scope: "read", weight: 6 });
        if (!auth.ok) return auth.response;

        const raw = auth.caller.params.get("symbol");
        const pair = raw ? resolveSymbol(raw) : null;
        if (raw && !pair) return apiError(ERR.BAD_SYMBOL, "Invalid symbol", 400);

        const { apiOpenOrders } = await import("@/lib/api/private.server");
        return privateJson(await apiOpenOrders(auth.caller.userId, pair));
      },
    },
  },
});
