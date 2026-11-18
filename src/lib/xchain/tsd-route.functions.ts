import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SWAP_COIN_IDS, swapCoin } from "./assets";

const quoteInput = z.object({
  direction: z.enum(["buy", "sell"]),
  coin: z.enum(SWAP_COIN_IDS),
  amount: z.string().trim().min(1).max(32),
});

/** Public: price a TSD route (TSD Bridge + THORChain). Read-only, nothing is created. */
export const getTsdRouteQuote = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => quoteInput.parse(input))
  .handler(async ({ data }) => {
    const { quoteTsdRoute } = await import("./tsd-route.server");
    return quoteTsdRoute(data.direction, swapCoin(data.coin)!, data.amount);
  });

async function callerIsAdmin(supabase: { from: (t: "user_roles") => any }, userId: string): Promise<boolean> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  return Boolean(data);
}

/** Signed-in: the member's TSD swaps, nudged forward first (each step is claimed, so this is safe to repeat). */
export const getTsdRoutes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { advanceRoute, listTsdRoutes } = await import("./tsd-route.server");
    const { data: open } = await context.supabase
      .from("tsd_routes")
      .select("id, stage")
      .eq("user_id", context.userId)
      .not("stage", "in", "(done,refunded,kept_usdc,failed,needs_ok)")
      .limit(1);
    if (open?.[0]) await advanceRoute(open[0].id).catch((e) => console.error("tsd route refresh failed", e));
    return { routes: await listTsdRoutes(context.userId) };
  });

const startInput = quoteInput.extend({ shownOut: z.number().positive() });

/** Signed-in: start a TSD route from the member's instant-access trading pocket. */
export const startTsdSwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => startInput.parse(input))
  .handler(async ({ data, context }) => {
    const isAdmin = await callerIsAdmin(context.supabase as never, context.userId);
    const { startTsdRoute } = await import("./tsd-route.server");
    return startTsdRoute(context.userId, isAdmin, data);
  });

const answerInput = z.object({ id: z.string().uuid(), choice: z.enum(["continue", "stop"]) });

/** Signed-in: answer a route that paused because the price moved. */
export const answerTsdSwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => answerInput.parse(input))
  .handler(async ({ data, context }) => {
    const { answerRoute } = await import("./tsd-route.server");
    await answerRoute(context.userId, data.id, data.choice);
    return { ok: true };
  });
