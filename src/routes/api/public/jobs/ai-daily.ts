import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Seeds AI daily job, three scheduled calls:
//   {"step":"request"} 03:05 UTC — queue price downloads (inside Postgres)
//   {"step":"ingest"}  03:20 UTC — save finished downloads
//   {"step":"check"}   13:00 UTC — daily plan check + Telegram message per live plan
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
          await supabaseAdmin.rpc("ai_sync_ingest");
          const { runDailyChecks } = await import("@/lib/ai/ai.server");
          return Response.json({ success: true, ...(await runDailyChecks()) });
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
