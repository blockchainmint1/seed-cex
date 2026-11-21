import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isBotUA, isSameOriginRequest, shouldCountHost } from "@/lib/site-traffic";
import { IP_LIMITS } from "@/lib/ip-rate";

// Seeds' own ad counter: one view or click for one running ad. Public by design
// (pages call it), so it stores no IP, member id or session — only daily totals —
// and is capped per connection. Only the live site is counted.
const schema = z.object({ adId: z.string().uuid(), kind: z.enum(["view", "click"]) });
const noContent = () => new Response(null, { status: 204 });

export const Route = createFileRoute("/api/public/ad-event")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isSameOriginRequest(request)) return new Response("Forbidden", { status: 403 });
        const text = await request.text().catch(() => "");
        if (text.length > 512) return new Response("Too large", { status: 413 });
        let body: unknown;
        try { body = JSON.parse(text); } catch { return new Response("Bad request", { status: 400 }); }
        const parsed = schema.safeParse(body);
        if (!parsed.success) return new Response("Bad request", { status: 400 });
        const host = (() => { try { return new URL(request.url).hostname; } catch { return null; } })();
        if (!shouldCountHost(host) || isBotUA(request.headers.get("user-agent") ?? "")) return noContent();
        const { ipAllowed } = await import("@/lib/ip-rate.server");
        if (!(await ipAllowed("ad-event", request.headers, IP_LIMITS.adEvent))) return new Response("Too many requests", { status: 429 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.rpc("ad_stat_bump", { _ad: parsed.data.adId, _kind: parsed.data.kind });
        if (error) console.error("[ad-event] bump failed", error.message);
        return noContent();
      },
    },
  },
});
