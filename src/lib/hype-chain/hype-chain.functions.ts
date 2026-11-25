import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const base = z.object({
  direction: z.enum(["to_hype", "from_hype", "to_ton", "to_ton_usdt"]),
  via: z.enum(["tsd", "xchain"]),
  coin: z.string().min(1).max(40),
  amount: z.string().regex(/^\d{1,12}(\.\d+)?$/).max(40),
});

/** Public: price for a one-tap coin <-> HYPE swap through ETH (read-only, rate-limited per connection). */
export const quoteHypeChainSwap = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => base.parse(i))
  .handler(async ({ data }) => {
    const { requireIpAllowance } = await import("@/lib/ip-rate.server");
    const { IP_LIMITS } = await import("@/lib/ip-rate");
    await requireIpAllowance("quote", IP_LIMITS.quote);
    const { quoteHypeChain } = await import("./hype-chain.server");
    try {
      return { ok: true as const, error: null, ...(await quoteHypeChain(data)), quotedAt: Date.now() };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e), direction: data.direction, via: data.via, coin: data.coin, amountIn: Number(data.amount), mid: 0, ton: null, out: 0, amountUsd: null, outUsd: null, protocol: null, seconds: null, quotedAt: Date.now() };
    }
  });

export const startHypeChainSwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => base.extend({ shownOut: z.number().positive(), slippageBps: z.number().int().min(10).max(1000) }).parse(i))
  .handler(async ({ data, context }) => {
    const { pilotTesterAccess } = await import("@/lib/admin-guard");
    const { requestHypeChain } = await import("./hype-chain.server");
    return requestHypeChain(context.userId, await pilotTesterAccess(context as never), data);
  });

export const getHypeChainSwaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listHypeChains } = await import("./hype-chain.server");
    return { swaps: await listHypeChains(context.userId) };
  });

export const cancelMyHypeChain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { cancelHypeChain } = await import("./hype-chain.server");
    await cancelHypeChain(context.userId, data.id);
    return { ok: true };
  });
