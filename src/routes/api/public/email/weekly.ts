import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Monday 00:00 UTC of the current week — the end of the week being reported. */
function lastMonday(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

// Scheduled Mondays. Each member gets at most one email per week (dedupe in alert_log),
// so repeat runs that morning only pick up anyone the first run didn't reach.
export const Route = createFileRoute("/api/public/email/weekly")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { emailWeeklyUpdate } = await import("@/lib/email/events.server");
        const end = lastMonday(new Date());
        const started = Date.now();
        const tally = { sent: 0, skipped: 0, failed: 0, remaining: 0 };
        const { data: people } = await supabaseAdmin.from("profiles").select("id").eq("email_weekly_update", true).order("id").limit(5000);
        for (const [i, p] of (people ?? []).entries()) {
          if (Date.now() - started > 25_000) { tally.remaining = (people?.length ?? 0) - i; break; }
          tally[await emailWeeklyUpdate(p.id, end)]++;
        }
        return Response.json({ week_ending: end.toISOString().slice(0, 10), ...tally });
      },
    },
  },
});
