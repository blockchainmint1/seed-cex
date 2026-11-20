import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Every minute: move open TSD swaps and token swaps forward (bridge payouts, THORChain progress, pool swaps, gas confirmations). */
export const Route = createFileRoute("/api/public/jobs/tsd-routes")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        // Seeds AI plan trades first: approved ones start here as ordinary TSD swaps, finished ones are recorded.
        const { advanceAiMoves } = await import("@/lib/ai/execute.server");
        const ai = await advanceAiMoves().catch((e) => { console.error("[ai-exec] job failed", e); return null; });
        const { advanceOpenRoutes } = await import("@/lib/xchain/tsd-route.server");
        const result = await advanceOpenRoutes();
        // Uniswap / PancakeSwap / PulseX token swaps (their TSD Bridge steps are ordinary routes, moved above).
        const { advanceOpenDexSwaps } = await import("@/lib/dex/swap.server");
        const dex = await advanceOpenDexSwaps().catch((e) => { console.error("[dex-swap] job failed", e); return null; });
        return Response.json({ ok: true, ...result, ai, dex });
      },
    },
  },
});
