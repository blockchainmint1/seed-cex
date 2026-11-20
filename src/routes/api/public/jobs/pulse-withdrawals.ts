import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Scheduled: send withdrawals (every coin) whose hold is over, and track confirmations. Path kept for the existing schedule. */
export const Route = createFileRoute("/api/public/jobs/pulse-withdrawals")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { advanceWithdrawals } = await import("@/lib/withdraw/withdraw.server");
        const result = await advanceWithdrawals();
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
