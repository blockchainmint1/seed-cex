import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { THOR_MARKET_SLUGS, TIMEFRAME_IDS } from "./thor-markets";

/** Public: every primary market (THORChain majors priced in TSD). */
export const getThorMarkets = createServerFn({ method: "GET" }).handler(async () => {
  const s = await import("./thor-markets.server");
  if (s.marketsNeedFetch()) {
    const { requireIpAllowance } = await import("@/lib/ip-rate.server");
    const { IP_LIMITS } = await import("@/lib/ip-rate");
    await requireIpAllowance("chart", IP_LIMITS.chart);
  }
  return s.fetchThorMarkets();
});

/** Public: candles for one primary market. */
export const getThorChart = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ slug: z.enum(THOR_MARKET_SLUGS), tf: z.enum(TIMEFRAME_IDS) }).parse(input),
  )
  .handler(async ({ data }) => {
    const s = await import("./thor-markets.server");
    if (s.marketsNeedFetch(data.slug, data.tf)) {
      const { requireIpAllowance } = await import("@/lib/ip-rate.server");
      const { IP_LIMITS } = await import("@/lib/ip-rate");
      await requireIpAllowance("chart", IP_LIMITS.chart);
    }
    return s.fetchThorChart(data.slug, data.tf);
  });
