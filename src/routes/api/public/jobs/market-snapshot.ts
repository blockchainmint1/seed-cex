import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Every 5 minutes: save the live THORChain market, chain and network figures as permanent history, and check linked pockets for new deposits. */
export const Route = createFileRoute("/api/public/jobs/market-snapshot")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { recordMarketSnapshot } = await import("@/lib/markets/snapshot.server");
        const result = await recordMarketSnapshot();
        // Deposit history for linked pockets, a few members per run (read-only on every chain).
        const { syncDueDeposits } = await import("@/lib/activity/deposits.server");
        const deposits = await syncDueDeposits().catch((e) => { console.error("[deposits] job failed", e); return null; });
        // Receive addresses of links saved before link-time saving existed, a few per run (admin Accounts reads them).
        const { backfillLinkAddresses } = await import("@/lib/pockets/link-addresses.server");
        const linkAddresses = await backfillLinkAddresses().catch((e) => { console.error("[pocket-addresses] backfill failed", e); return null; });
        // Invite codes → their Seeds owners (Admin → Affiliates), members not checked in the last day.
        const { syncReferralOwners } = await import("@/lib/affiliates.server");
        const referralOwners = await syncReferralOwners(200);
        // A run that stored neither markets nor chains is a failure the scheduler should see.
        return Response.json({ ok: result.markets > 0 && result.chains > 0, ...result, deposits, linkAddresses, referralOwners });
      },
    },
  },
});
