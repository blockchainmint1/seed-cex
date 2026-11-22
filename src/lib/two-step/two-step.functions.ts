import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SWAP_COIN_IDS } from "@/lib/xchain/assets";
import { DEX_NETWORK_IDS, isAddress, type DexNetwork } from "@/lib/dex/venues";
import { MAX_SLIPPAGE_BPS } from "@/lib/dex/swap-rules";

const twoStepInput = z.object({
  direction: z.enum(["dex_then_x", "x_then_dex"]),
  network: z.enum(DEX_NETWORK_IDS as unknown as [DexNetwork, ...DexNetwork[]]),
  token: z.string().max(64).refine((a) => isAddress(a), "Not a coin address"),
  coin: z.enum(SWAP_COIN_IDS),
  amount: z.string().regex(/^\d+(\.\d+)?$/).max(40),
});

/** Public: live price for a two-step swap (pool hop + THORChain/Maya hop), best in-between coin first. Read-only. */
export const quoteTwoStepSwap = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => twoStepInput.parse(i))
  .handler(async ({ data }) => {
    const { requireIpAllowance } = await import("@/lib/ip-rate.server");
    const { IP_LIMITS } = await import("@/lib/ip-rate");
    await requireIpAllowance("quote", IP_LIMITS.quote);
    const { quoteTwoStep } = await import("./two-step.server");
    return quoteTwoStep(data);
  });

/** Signed-in: ask for a two-step swap from my own pocket. It waits for one Approve tap in Telegram. */
export const startTwoStepSwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    twoStepInput.extend({ shownOut: z.number().positive(), slippageBps: z.number().int().min(10).max(MAX_SLIPPAGE_BPS) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { pilotTesterAccess } = await import("@/lib/admin-guard");
    const tester = await pilotTesterAccess(context as never);
    const { requestTwoStep } = await import("./two-step.server");
    return requestTwoStep(context.userId, tester, data);
  });

/** Signed-in: my recent two-step swaps (moves open ones along first). */
export const getTwoStepSwaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listTwoSteps } = await import("./two-step.server");
    return { swaps: await listTwoSteps(context.userId) };
  });

/** Signed-in: call off a two-step swap still waiting for my Telegram tap. */
export const cancelMyTwoStepSwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { cancelTwoStep } = await import("./two-step.server");
    await cancelTwoStep(context.userId, data.id);
    return { ok: true };
  });
