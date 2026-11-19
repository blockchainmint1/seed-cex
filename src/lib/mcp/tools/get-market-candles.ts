import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { THOR_MARKET_SLUGS } from "../../markets/thor-markets";

export default defineTool({
  name: "get_market_candles",
  title: "Get market candles",
  description:
    "Price candles (open, high, low, close, volume in TSD) for one Seeds market, newest last. Use list_markets to see the market slugs.",
  inputSchema: {
    market: z.enum(THOR_MARKET_SLUGS).describe("Market slug, e.g. btc-tsd or eth-tsd."),
    timeframe: z.enum(["15m", "1h", "4h", "1d", "1w"]).default("1d").describe("Candle size."),
    limit: z.number().int().min(1).max(200).default(30).describe("How many of the newest candles to return (1-200)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ market, timeframe, limit }) => {
    const { fetchThorChart } = await import("../../markets/thor-markets.server");
    const r = await fetchThorChart(market, timeframe).catch(() => {
      throw new ToolError("THORChain market data is unavailable right now. Try again in a minute.");
    });
    const candles = r.candles.slice(-limit).map((c) => ({
      time: new Date(c.time * 1000).toISOString(),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume_tsd: c.volume,
    }));
    const last = candles[candles.length - 1];
    const text = last
      ? `${r.market.base}/TSD ${timeframe}: ${candles.length} candles, latest close ${last.close} TSD at ${last.time}.`
      : `${r.market.base}/TSD has no ${timeframe} candles right now.`;
    return {
      content: [{ type: "text", text }],
      structuredContent: { market: `${r.market.base}/TSD`, timeframe, price_tsd: r.market.price, candles },
    };
  },
});
