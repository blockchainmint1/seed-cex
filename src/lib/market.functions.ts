import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PAIR = "USDC_TXC";
const pairInput = (input: unknown) =>
  z.object({ pair: z.string().trim().max(24).default(PAIR) }).parse(input ?? {});

export const getOrderBook = createServerFn({ method: "GET" })
  .inputValidator(pairInput)
  .handler(async ({ data }) => {
    const { fetchOrderBook } = await import("./market.server");
    return fetchOrderBook(data.pair);
  });

export const getTape = createServerFn({ method: "GET" })
  .inputValidator(pairInput)
  .handler(async ({ data }) => {
    const { fetchTape } = await import("./market.server");
    return fetchTape(data.pair);
  });

export const getMarketStats = createServerFn({ method: "GET" })
  .inputValidator(pairInput)
  .handler(async ({ data }) => {
    const { fetchStats } = await import("./market.server");
    return fetchStats(data.pair);
  });

export const getPriceSeries = createServerFn({ method: "GET" })
  .inputValidator(pairInput)
  .handler(async ({ data }) => {
    const { fetchSeries } = await import("./market.server");
    return fetchSeries(data.pair);
  });
