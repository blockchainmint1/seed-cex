import { defineTool, ToolError } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "list_markets",
  title: "List markets",
  description:
    "Live prices in TSD (1 TSD = 1 US dollar) for the major coins Seeds shows from THORChain, with 24-hour change, high, low, volume and pool liquidity.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async () => {
    const { fetchThorMarkets } = await import("../../markets/thor-markets.server");
    const rows = await fetchThorMarkets().catch(() => {
      throw new ToolError("THORChain market data is unavailable right now. Try again in a minute.");
    });
    const markets = rows.map((m) => ({
      market: `${m.base}/TSD`,
      slug: m.slug,
      name: m.name,
      price_tsd: m.price,
      change_24h_pct: m.day.changePct,
      high_24h: m.day.high,
      low_24h: m.day.low,
      volume_24h_tsd: m.day.volume,
      liquidity_tsd: m.liquidity,
      trading_live_on_thorchain: m.live,
      page: `https://seeds.honest.money/markets/${m.slug}`,
    }));
    const text = markets
      .map((m) => `${m.market}: ${m.price_tsd ?? "n/a"} TSD (${m.change_24h_pct == null ? "n/a" : m.change_24h_pct.toFixed(2) + "%"} 24h)${m.trading_live_on_thorchain ? "" : " — paused"}`)
      .join("\n");
    return { content: [{ type: "text", text }], structuredContent: { markets } };
  },
});
