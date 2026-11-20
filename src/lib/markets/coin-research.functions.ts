import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { THOR_MARKET_SLUGS, thorMarket } from "./thor-markets";

const slugInput = (input: unknown) => z.object({ slug: z.enum(THOR_MARKET_SLUGS) }).parse(input);

/** Public: global market data, links, other exchanges and news for one coin (all from the shared cache). */
export const getCoinResearch = createServerFn({ method: "GET" })
  .inputValidator(slugInput)
  .handler(async ({ data }) => {
    const s = await import("./coin-research.server");
    const [profiles, pairs, news] = await Promise.all([
      s.coinProfiles().catch(() => ({}) as Record<string, never>),
      s.coinPairs(data.slug).catch(() => []),
      s.coinNews(data.slug).catch(() => []),
    ]);
    return { profile: (profiles as Record<string, import("./coin-research").CoinProfile>)[data.slug] ?? null, pairs, news };
  });

/** Public: the latest finished swaps in this coin's THORChain pool. */
export const getPoolTrades = createServerFn({ method: "GET" })
  .inputValidator(slugInput)
  .handler(async ({ data }) => {
    const { poolTrades } = await import("./coin-research.server");
    return poolTrades(data.slug);
  });

/** Public: live THORChain quotes for four fixed trade sizes (cached a minute for everyone). */
export const getCostBySize = createServerFn({ method: "GET" })
  .inputValidator(slugInput)
  .handler(async ({ data }) => {
    const { costBySize } = await import("./coin-research.server");
    return costBySize(data.slug);
  });

/** Signed-in: the member's own swaps and order-book orders for this coin. Read as the member (their own rows only). */
export const getMyCoinActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(slugInput)
  .handler(async ({ data, context }) => {
    const m = thorMarket(data.slug)!;
    const sb = context.supabase;
    const [routes, sends, orders] = await Promise.all([
      sb.from("tsd_routes")
        .select("id, direction, amount_in, amount_usd, shown_out, amount_out, stage, swap_send_id, created_at")
        .eq("user_id", context.userId).eq("coin_asset", m.pool)
        .order("created_at", { ascending: false }).limit(25),
      sb.from("swap_sends")
        .select("id, from_asset, to_asset, amount_in, amount_usd, expected_out, status, txid, created_at")
        .eq("user_id", context.userId).or(`from_asset.eq."${m.pool}",to_asset.eq."${m.pool}"`)
        .order("created_at", { ascending: false }).limit(25),
      m.book
        ? sb.from("orders")
          .select("id, side, price, amount, filled, status, order_type, created_at")
          .eq("user_id", context.userId).eq("pair", `${m.base}_TSD`)
          .order("created_at", { ascending: false }).limit(25)
        : Promise.resolve({ data: [], error: null }),
    ]);
    for (const r of [routes, sends, orders]) if (r.error) throw new Error("Couldn't load your activity. Try again in a minute.");
    // A TSD swap's THORChain step is already shown as part of that TSD swap.
    const inRoutes = new Set((routes.data ?? []).map((r) => r.swap_send_id).filter(Boolean));
    return { tsdSwaps: routes.data ?? [], swaps: (sends.data ?? []).filter((s) => !inRoutes.has(s.id)), orders: orders.data ?? [] };
  });
