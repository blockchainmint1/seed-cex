import { createFileRoute } from "@tanstack/react-router";

/**
 * TSD Bridge status notifications (signed). Only a nudge: the matching TSD swap is
 * moved forward by its normal step, which re-reads the order from TSD Bridge's API.
 * The every-minute job stays the record of truth (notifications are never retried).
 */
export const Route = createFileRoute("/api/public/tsd-bridge/webhook")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > 64_000) return new Response("Too large", { status: 413 });
        const { verifyTsdWebhook, webhookOrderId } = await import("@/lib/xchain/tsd-webhook");
        const v = await verifyTsdWebhook({
          secret: process.env.TSD_BRIDGE_WEBHOOK_SECRET?.trim(),
          timestamp: request.headers.get("x-tsd-timestamp"),
          signature: request.headers.get("x-tsd-signature"),
          rawBody: raw,
          nowSec: Math.floor(Date.now() / 1000),
        });
        if (!v.ok) return new Response(v.reason === "no_secret" ? "Not set up" : "Unauthorized", { status: v.reason === "no_secret" ? 503 : 401 });

        let body: unknown;
        try { body = JSON.parse(raw); } catch { return new Response("Bad request", { status: 400 }); }
        const orderId = webhookOrderId(body);
        const event = request.headers.get("x-tsd-event")?.slice(0, 40) ?? "unknown";
        if (!orderId) return Response.json({ ok: true, matched: false });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: route } = await supabaseAdmin.from("tsd_routes").select("id").eq("bridge_order_id", orderId).maybeSingle();
        if (!route) return Response.json({ ok: true, matched: false });
        try {
          const { advanceRoute } = await import("@/lib/xchain/tsd-route.server");
          await advanceRoute(route.id);
        } catch (e) {
          // The every-minute job picks it up anyway.
          console.error("[tsd-webhook] advance failed", event, e instanceof Error ? e.message : e);
        }
        return Response.json({ ok: true, matched: true });
      },
    },
  },
});
