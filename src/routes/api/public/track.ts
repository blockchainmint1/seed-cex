import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  deviceFromUA,
  isBotUA,
  isSameOriginRequest,
  normalizePath,
  referrerSource,
  shouldCountHost,
} from "@/lib/site-traffic";

// Seeds' own anonymous visit counter (feeds the public /stats traffic section).
// Public by design: stores no IP, member id or email; only counts the live site.
const payloadSchema = z.object({
  path: z.string().min(1).max(500),
  referrer: z.string().max(1000).optional().nullable(),
  sessionId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  isNewSession: z.boolean().optional(),
});

const noContent = () => new Response(null, { status: 204 });

export const Route = createFileRoute("/api/public/track")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isSameOriginRequest(request)) return new Response("Forbidden", { status: 403 });
        const text = await request.text().catch(() => "");
        if (text.length > 4096) return new Response("Too large", { status: 413 });
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const parsed = payloadSchema.safeParse(body);
        if (!parsed.success) return new Response("Bad request", { status: 400 });

        const host = (() => {
          try {
            return new URL(request.url).hostname;
          } catch {
            return null;
          }
        })();
        const ua = request.headers.get("user-agent") ?? "";
        if (!shouldCountHost(host) || isBotUA(ua)) return noContent();

        const country = (request.headers.get("cf-ipcountry") ?? "").toUpperCase();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("site_page_views").insert({
          path: normalizePath(parsed.data.path),
          referrer_host: referrerSource(parsed.data.referrer),
          country: /^[A-Z]{2}$/.test(country) && country !== "XX" && country !== "T1" ? country : null,
          device: deviceFromUA(ua),
          session_id: parsed.data.sessionId,
          is_new_session: parsed.data.isNewSession ?? false,
        });
        if (error) console.error("[track] insert failed", error.message);
        // Keep at most a year of detail; cheap occasional clean-up instead of a cron job.
        if (Math.random() < 0.002) await supabaseAdmin.rpc("site_page_views_prune").then(() => undefined, () => undefined);
        return noContent();
      },
    },
  },
});
