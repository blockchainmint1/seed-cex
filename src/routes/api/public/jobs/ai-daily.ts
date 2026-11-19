import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Seeds AI daily job, three scheduled calls:
//   {"step":"request"} 03:05 UTC — queue price downloads (inside Postgres)
//   {"step":"ingest"}  03:20 UTC — save finished downloads
//   {"step":"check"}   every minute — checks the plans whose own time has come (each plan
//                      runs every 24 h at the time of day it was started) + their Telegram message
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
          // Pick up finished price downloads twice an hour (they're queued once a day).
          if (new Date().getUTCMinutes() % 30 === 0) await supabaseAdmin.rpc("ai_sync_ingest");
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
