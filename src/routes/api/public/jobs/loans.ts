import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Every 5 minutes: move Seeds Lend loans along — collateral arriving, funding confirming,
 * price checks, margin calls, liquidations, defaults and lockbox payouts — and end loan
 * offers nobody answered in time.
 */
export const Route = createFileRoute("/api/public/jobs/loans")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { tickAllLoans } = await import("@/lib/loans/loans.server");
        const result = await tickAllLoans();
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
