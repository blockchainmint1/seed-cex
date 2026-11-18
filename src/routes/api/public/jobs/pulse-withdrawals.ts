import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Every 5 minutes: send PulseChain withdrawals whose 24-hour hold is over, and track confirmations. */
export const Route = createFileRoute("/api/public/jobs/pulse-withdrawals")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { advancePulseWithdrawals } = await import("@/lib/pulse/withdraw.server");
        const result = await advancePulseWithdrawals();
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
