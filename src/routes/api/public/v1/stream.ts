import { createFileRoute } from "@tanstack/react-router";

/**
 * Server-Sent Events market stream.
 *
 * Seeds runs on an edge runtime without long-lived WebSocket sockets, so live
 * data ships as SSE — one HTTP connection, server-pushed events, auto-reconnect
 * built into every browser and most bot HTTP clients. Payload shapes match the
 * REST responses so a bot can share parsing code.
 *
 *   GET /api/public/v1/stream?symbol=TXCUSDC&streams=ticker,depth,trade
 */
export const Route = createFileRoute("/api/public/v1/stream")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api/v1.server")).apiPreflight(),
      GET: async ({ request }) => {
        const { resolveSymbol, apiError, ERR, build24hr, buildDepth, buildTrades } = await import(
          "@/lib/api/v1.server"
        );
        const url = new URL(request.url);
        const pair = resolveSymbol(url.searchParams.get("symbol"));
        if (!pair) return apiError(ERR.BAD_SYMBOL, "Invalid symbol", 400);

        const wanted = new Set(
          (url.searchParams.get("streams") ?? "ticker,depth,trade").split(",").map((s) => s.trim()),
        );
        const intervalMs = Math.min(Math.max(Number(url.searchParams.get("interval") ?? 2000) || 2000, 1000), 30_000);
        const maxMs = 10 * 60_000; // clients reconnect; keeps edge invocations bounded

        const encoder = new TextEncoder();
        let lastTradeId: string | null = null;

        const stream = new ReadableStream({
          async start(controller) {
            const started = Date.now();
            const send = (event: string, data: unknown) =>
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

            send("open", { symbol: `${pair.base}${pair.quote}`, streams: [...wanted], intervalMs });

            try {
              while (Date.now() - started < maxMs) {
                if (wanted.has("ticker")) send("ticker", await build24hr(pair));
                if (wanted.has("depth")) send("depth", await buildDepth(pair, 50));
                if (wanted.has("trade")) {
                  const trades = await buildTrades(pair, 50);
                  const fresh = lastTradeId
                    ? trades.slice(0, trades.findIndex((t) => t.id === lastTradeId) === -1 ? trades.length : trades.findIndex((t) => t.id === lastTradeId))
                    : trades.slice(0, 1);
                  if (trades[0]) lastTradeId = trades[0].id;
                  for (const t of [...fresh].reverse()) send("trade", t);
                }
                await new Promise((r) => setTimeout(r, intervalMs));
              }
              send("close", { reason: "max-duration", reconnect: true });
            } catch (e) {
              send("error", { msg: e instanceof Error ? e.message : "stream error" });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store",
            connection: "keep-alive",
            "access-control-allow-origin": "*",
          },
        });
      },
    },
  },
});
