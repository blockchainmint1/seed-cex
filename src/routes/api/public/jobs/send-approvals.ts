import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Every minute: end "approve this send?" requests nobody tapped in time, and cancel their trades. */
export const Route = createFileRoute("/api/public/jobs/send-approvals")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { expireDueApprovals } = await import("@/lib/pocket-send/approvals.server");
        const result = await expireDueApprovals();
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
