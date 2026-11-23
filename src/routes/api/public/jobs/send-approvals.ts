import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Every minute: end "approve this send?" requests nobody tapped in time (and cancel their trades),
 * start matched trades whose payout never started, then move exchange settlements along: the second side is sent only once the first is confirmed,
 * then cancel orders whose coins have left the member's pocket, finish cut-off Ignite seat notices, and move expired class checkouts to the interest list.
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
        // Approved orders whose tap-time run never placed them (audit O1).
        const { resumeOrderRequests } = await import("@/lib/order-approval/order-approval.server");
        const orders = await resumeOrderRequests().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
        // Matched trades whose payout never started (audit O6): start them again.
        const { advanceSettlingTrades, resumeUnstartedTrades } = await import("@/lib/settle/confirm.server");
        const unstarted = await resumeUnstartedTrades().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
        const settling = await advanceSettlingTrades().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
        // Orders placed before one-tap approval come off the book; owners re-place them (reapprove.server.ts).
        const { retireUntappedOrders } = await import("@/lib/order-approval/reapprove.server");
        const reapprove = await retireUntappedOrders().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
        // Orders whose coins left the pocket outside Seeds come off the book (order-cover.server.ts).
        const { checkOrderCover } = await import("@/lib/order-cover.server");
        const cover = await checkOrderCover().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
        // Paid Ignite seats whose confirmation email/Telegram/Honest.Money report was cut off.
        const { resumeSeatNotices } = await import("@/lib/ignite-confirm.server");
        const seatNotices = await resumeSeatNotices().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
        // Unpaid class sign-ups whose checkout ran out move to the interest list (ignite-classes.server.ts).
        const { sweepLapsedCheckouts } = await import("@/lib/ignite-classes.server");
        const lapsed = await sweepLapsedCheckouts().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
        return Response.json({ ok: true, ...result, orders, unstarted, settling, reapprove, cover, seatNotices, lapsed });
      },
    },
  },
});
