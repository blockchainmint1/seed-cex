import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Every 5 minutes: save the live THORChain market, chain and network figures as permanent history. */
export const Route = createFileRoute("/api/public/jobs/market-snapshot")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { recordMarketSnapshot } = await import("@/lib/markets/snapshot.server");
        const result = await recordMarketSnapshot();
        // A run that stored neither markets nor chains is a failure the scheduler should see.
        return Response.json({ ok: result.markets > 0 && result.chains > 0, ...result });
      },
    },
  },
});
