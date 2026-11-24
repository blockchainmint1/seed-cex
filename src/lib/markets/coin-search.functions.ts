import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Public: coins matching what was typed (from a daily-cached CoinMarketCap list). */
export const searchCoinList = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ q: z.string().max(60) }).parse(i))
  .handler(async ({ data }) => {
    const s = await import("./coin-search.server");
    const { searchCoins, seedsPlace } = await import("./coin-search");
    const list = await s.coinList().catch(() => []);
    return searchCoins(list, data.q).map(([id, name, symbol, rank]) => ({ id, name, symbol, rank, onSeeds: seedsPlace(symbol, name) }));
  });

/** Public: market data, description and links for any CoinMarketCap coin id. */
export const getAnyCoin = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ id: z.number().int().positive().max(10_000_000) }).parse(i))
  .handler(async ({ data }) => {
    const s = await import("./coin-search.server");
    const { seedsPlace } = await import("./coin-search");
    const profile = await s.anyCoinProfile(data.id).catch(() => null);
    return { profile, onSeeds: profile ? seedsPlace(profile.symbol, profile.name) : null };
  });
