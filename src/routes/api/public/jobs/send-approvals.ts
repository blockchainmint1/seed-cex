import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Every minute: end "approve this send?" requests nobody tapped in time (and cancel their trades),
 * then move exchange settlements along: the second side is sent only once the first is confirmed,
 * then cancel orders whose coins have left the member's pocket.
 */
export const Route = createFileRoute("/api/public/jobs/send-approvals")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { expireDueApprovals } = await import("@/lib/pocket-send/approvals.server");
        const result = await expireDueApprovals();
        const { advanceSettlingTrades } = await import("@/lib/settle/confirm.server");
        const settling = await advanceSettlingTrades().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
        // Orders whose coins left the pocket outside Seeds come off the book (order-cover.server.ts).
        const { checkOrderCover } = await import("@/lib/order-cover.server");
        const cover = await checkOrderCover().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
        return Response.json({ ok: true, ...result, settling, cover });
      },
    },
  },
});
