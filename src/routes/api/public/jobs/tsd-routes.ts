import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Every minute: move open TSD swaps forward (bridge payouts, THORChain progress, gas confirmations). */
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
        return Response.json({ ok: true, ...result, ai });
      },
    },
  },
});
