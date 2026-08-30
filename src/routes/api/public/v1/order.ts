import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/order")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api/v1.server")).apiPreflight(),

      /** Order status. */
      GET: async ({ request }) => {
        const { authenticate } = await import("@/lib/api/auth.server");
        const { privateJson, apiError, ERR } = await import("@/lib/api/v1.server");
        const auth = await authenticate(request, { scope: "read", weight: 4 });
        if (!auth.ok) return auth.response;

        const orderId = auth.caller.params.get("orderId");
        if (!orderId) return apiError(ERR.MANDATORY_PARAM_MISSING, "Missing orderId", 400);

        const { apiAllOrders } = await import("@/lib/api/private.server");
        const all = await apiAllOrders(auth.caller.userId, null, 1000);
        const found = all.find((o) => o.orderId === orderId);
        if (!found) return apiError(ERR.NO_SUCH_ORDER, "Order does not exist", 404);
        return privateJson(found);
      },

      /** New limit order. Matching and on-chain settlement run inline. */
      POST: async ({ request }) => {
        const { authenticate } = await import("@/lib/api/auth.server");
        const { privateJson, resolveSymbol, apiError, ERR } = await import("@/lib/api/v1.server");
        const auth = await authenticate(request, { scope: "trade", weight: 20 });
        if (!auth.ok) return auth.response;

        const p = auth.caller.params;
        const pair = resolveSymbol(p.get("symbol"));
        if (!pair) return apiError(ERR.BAD_SYMBOL, "Invalid symbol", 400);

        const type = (p.get("type") ?? "LIMIT").toUpperCase();
        if (type !== "LIMIT") {
          return apiError(ERR.UNSUPPORTED_ORDER_COMBO, "Only LIMIT orders are supported", 400);
        }
        const tif = (p.get("timeInForce") ?? "GTC").toUpperCase();
        if (tif !== "GTC") {
          return apiError(ERR.UNSUPPORTED_ORDER_COMBO, "Only GTC timeInForce is supported", 400);
        }

        const sideRaw = (p.get("side") ?? "").toUpperCase();
        if (sideRaw !== "BUY" && sideRaw !== "SELL") {
          return apiError(ERR.BAD_SIDE, "side must be BUY or SELL", 400);
        }

        const price = Number(p.get("price"));
        const quantity = Number(p.get("quantity"));
        const { validateOrder, apiPlaceOrder } = await import("@/lib/api/private.server");
        const bad = validateOrder(pair, price, quantity);
        if (bad) return apiError(ERR.INVALID_QUANTITY, bad, 400);

        try {
          const result = await apiPlaceOrder(auth.caller.userId, {
            symbol: pair,
            side: sideRaw === "BUY" ? "buy" : "sell",
            price,
            quantity,
          });
          return privateJson(result);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Order rejected";
          return apiError(ERR.ORDER_REJECTED, msg, 400);
        }
      },

      /** Cancel an open order. */
      DELETE: async ({ request }) => {
        const { authenticate } = await import("@/lib/api/auth.server");
        const { privateJson, apiError, ERR } = await import("@/lib/api/v1.server");
        const auth = await authenticate(request, { scope: "trade", weight: 4 });
        if (!auth.ok) return auth.response;

        const orderId = auth.caller.params.get("orderId");
        if (!orderId) return apiError(ERR.MANDATORY_PARAM_MISSING, "Missing orderId", 400);

        const { apiCancelOrder } = await import("@/lib/api/private.server");
        const cancelled = await apiCancelOrder(auth.caller.userId, orderId);
        if (!cancelled) return apiError(ERR.CANCEL_REJECTED, "Order is not open or does not exist", 400);
        return privateJson(cancelled);
      },
    },
  },
});
