import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Seeds AI daily job, three scheduled calls:
//   {"step":"request"} 00:01 UTC — queue price downloads (inside Postgres) right after the day closes
//   {"step":"ingest"}  00:04 UTC — save finished downloads
//   {"step":"check"}   every minute — keeps chasing yesterday's close in the first hours after
//                      midnight (price-catchup.ts), then checks the plans whose own time has come
//                      (each plan runs every 24 h at the time of day it was started) + their Telegram message
export const Route = createFileRoute("/api/public/jobs/ai-daily")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        let step = "request";
        try {
          const body = (await request.json()) as { step?: string };
          if (body?.step === "ingest" || body?.step === "check") step = body.step;
        } catch { /* no body = request step */ }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (step === "check") {
          const { catchupSteps } = await import("@/lib/ai/price-catchup");
          const steps = catchupSteps(Date.now());
          try {
            if (steps.ingest) await supabaseAdmin.rpc("ai_sync_ingest");
            if (steps.request) await supabaseAdmin.rpc("ai_sync_request", { _with_markets: false });
            if (steps.fill) {
              const { fillClosesFromSnapshots } = await import("@/lib/ai/price-catchup.server");
              await fillClosesFromSnapshots(supabaseAdmin);
            }
          } catch (e) { console.error("[ai-daily] price catch-up failed", e); }
          const { runDailyChecks } = await import("@/lib/ai/ai.server");
          return Response.json({ success: true, ...(await runDailyChecks({ due: true, deadlineMs: 20_000 })) });
        }
        if (step === "ingest") {
          const { data, error } = await supabaseAdmin.rpc("ai_sync_ingest");
          if (error) return Response.json({ success: false, error: error.message }, { status: 500 });
          return Response.json({ success: true, saved: data });
        }
        await supabaseAdmin.rpc("ai_sync_ingest");
        const { data, error } = await supabaseAdmin.rpc("ai_sync_request", { _with_markets: true });
        if (error) return Response.json({ success: false, error: error.message }, { status: 500 });
        return Response.json({ success: true, requestsQueued: data });
      },
    },
  },
});
