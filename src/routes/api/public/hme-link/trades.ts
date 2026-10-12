import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/hme-link.server";

// Polled by the wallet every 30 s in approve mode. Only pending, unexpired proposals.
export const Route = createFileRoute("/api/public/hme-link/trades")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const linkId = u.searchParams.get("link_id");
        const identity = u.searchParams.get("identity");
        if (!linkId || !identity) return json({ trades: [] });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: link } = await supabaseAdmin.from("hme_links").select("id, identity_address, status, mode").eq("id", linkId).maybeSingle();
        if (!link || link.identity_address !== identity || link.status !== "active" || link.mode !== "approve") return json({ trades: [] });
        const { data } = await supabaseAdmin.from("hme_trade_proposals")
          .select("id, chain, psbt, summary, expires_at")
          .eq("link_id", linkId).eq("status", "pending").gt("expires_at", new Date().toISOString())
          .order("created_at").limit(20);
        return json({ trades: data ?? [] });
      },
    },
  },
});
