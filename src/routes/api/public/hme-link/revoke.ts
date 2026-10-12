import { createFileRoute } from "@tanstack/react-router";
import { json, linkDomainFor, revokeMessagePrefix, verifyTxcMessage } from "@/lib/hme-link.server";

export const Route = createFileRoute("/api/public/hme-link/revoke")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let b: { link_id?: string; identity_address?: string; signature?: string; message?: string };
        try { b = await request.json(); } catch { return json({ error: "bad json" }, 400); }
        if (!b.link_id || !b.identity_address || !b.signature || typeof b.message !== "string") return json({ error: "missing fields" }, 400);
        const prefix = revokeMessagePrefix(linkDomainFor(request), b.link_id);
        if (!b.message.startsWith(prefix)) return json({ error: "message mismatch" }, 400);
        const issued = Date.parse(b.message.slice(prefix.length).trim());
        if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > 15 * 60_000) return json({ error: "stale" }, 400);
        if (!verifyTxcMessage(b.identity_address, b.message, b.signature)) return json({ error: "bad signature" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: link } = await supabaseAdmin.from("hme_links").select("id, identity_address, status").eq("id", b.link_id).maybeSingle();
        if (!link || link.identity_address !== b.identity_address) return json({ error: "unknown link" }, 404);
        if (link.status === "active") {
          await supabaseAdmin.from("hme_links")
            .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: "wallet", key_ciphertext: null })
            .eq("id", link.id);
          await supabaseAdmin.from("hme_trade_proposals").update({ status: "expired" }).eq("link_id", link.id).eq("status", "pending");
        }
        return json({ revoked: true });
      },
    },
  },
});
