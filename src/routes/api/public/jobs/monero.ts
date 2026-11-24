import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Scheduled: set up members' Monero watch wallets (view key only) and refresh their balances. */
export const Route = createFileRoute("/api/public/jobs/monero")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { advanceMonero } = await import("@/lib/monero/wallet.server");
        return Response.json({ ok: true, ...(await advanceMonero()) });
      },
    },
  },
});
