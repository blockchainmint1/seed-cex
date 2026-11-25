import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RELAY_SLIPPAGE_CHOICES_BPS } from "./rules";

const direction = z.enum(["to_hype", "from_hype", "to_ton"]);
const amount = z.string().regex(/^\d{1,12}(\.\d+)?$/).max(40);

/** Public: Relay's price for ETH <-> HYPE (read-only, rate-limited per connection). */
export const quoteRelaySwap = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ direction, amount }).parse(i))
  .handler(async ({ data }) => {
    const { requireIpAllowance } = await import("@/lib/ip-rate.server");
    const { IP_LIMITS } = await import("@/lib/ip-rate");
    await requireIpAllowance("quote", IP_LIMITS.quote);
    const { previewRelayQuote } = await import("./relay.server");
    return { direction: data.direction, ...(await previewRelayQuote(data.direction, data.amount, null)), quotedAt: Date.now() };
  });

export const getRelaySwapContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ direction }).parse(i))
  .handler(async ({ data, context }) => {
    const { pilotTesterAccess } = await import("@/lib/admin-guard");
    const { relaySwapContext } = await import("./relay.server");
    return relaySwapContext(context.userId, await pilotTesterAccess(context as never), data.direction);
  });

export const startRelaySwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      direction, amount, shownOut: z.number().positive(),
      slippageBps: z.number().int().refine((b) => (RELAY_SLIPPAGE_CHOICES_BPS as readonly number[]).includes(b), "Pick a price protection"),
    }).parse(i))
  .handler(async ({ data, context }) => {
    const { pilotTesterAccess } = await import("@/lib/admin-guard");
    const { requestRelaySwap } = await import("./relay.server");
    return requestRelaySwap(context.userId, await pilotTesterAccess(context as never), data);
  });

export const getRelaySwaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listRelaySwaps } = await import("./relay.server");
    return { swaps: await listRelaySwaps(context.userId) };
  });

export const cancelMyRelaySwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { cancelRelaySwap } = await import("./relay.server");
    await cancelRelaySwap(context.userId, data.id);
    return { ok: true };
  });
