import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const amount = z.string().regex(/^\d{1,6}(\.\d{1,9})?$/);

/** Public: STON.fi's TON -> USD₮ price (read-only, rate-limited per connection). */
export const quoteTonUsdt = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ amount }).parse(i))
  .handler(async ({ data }) => {
    const { requireIpAllowance } = await import("@/lib/ip-rate.server");
    const { IP_LIMITS } = await import("@/lib/ip-rate");
    await requireIpAllowance("quote", IP_LIMITS.quote);
    const { quoteTonToUsdt } = await import("./ston.server");
    return quoteTonToUsdt(data.amount);
  });

export const getTonSwapContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { pilotTesterAccess } = await import("@/lib/admin-guard");
    const { tonSwapContext } = await import("./ston.server");
    return tonSwapContext(context.userId, await pilotTesterAccess(context as never));
  });

export const startTonUsdtSwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ amount, shownOutUnits: z.string().regex(/^\d{1,18}$/) }).parse(i))
  .handler(async ({ data, context }) => {
    const { pilotTesterAccess } = await import("@/lib/admin-guard");
    const { startTonToUsdt } = await import("./ston.server");
    return startTonToUsdt(context.userId, await pilotTesterAccess(context as never), data);
  });

export const getTonSwaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listTonSwaps } = await import("./ston.server");
    return { swaps: await listTonSwaps(context.userId) };
  });
