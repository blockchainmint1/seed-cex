import { createFileRoute } from "@tanstack/react-router";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64, hex } from "@scure/base";
import { json, linkDomainFor, tradeMessage, verifyTxcMessage } from "@/lib/hme-link.server";

type Body = { link_id?: string; trade_id?: string; decision?: string; signed_psbt?: string; identity_address?: string; signature?: string; message?: string };

export const Route = createFileRoute("/api/public/hme-link/trades/respond")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let b: Body;
        try { b = await request.json(); } catch { return json({ error: "bad json" }, 400); }
        if (!b.link_id || !b.trade_id || (b.decision !== "approve" && b.decision !== "decline") || !b.identity_address || !b.signature || typeof b.message !== "string")
          return json({ error: "missing fields" }, 400);
        let psbtSha = "none";
        if (b.decision === "approve") {
          if (!b.signed_psbt) return json({ error: "missing signed_psbt" }, 400);
          try { psbtSha = hex.encode(sha256(base64.decode(b.signed_psbt))); } catch { return json({ error: "bad psbt" }, 400); }
        }
        const expected = tradeMessage({ domain: linkDomainFor(request), decision: b.decision, linkId: b.link_id, tradeId: b.trade_id, psbtSha });
        if (b.message !== expected) return json({ error: "message mismatch" }, 400);
        if (!verifyTxcMessage(b.identity_address, b.message, b.signature)) return json({ error: "bad signature" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: link } = await supabaseAdmin.from("hme_links").select("id, identity_address, status").eq("id", b.link_id).maybeSingle();
        if (!link || link.identity_address !== b.identity_address || link.status !== "active") return json({ error: "unknown link" }, 404);
        const { data: updated } = await supabaseAdmin.from("hme_trade_proposals")
          .update({ status: b.decision === "approve" ? "approved" : "declined", signed_psbt: b.signed_psbt ?? null, responded_at: new Date().toISOString() })
          .eq("id", b.trade_id).eq("link_id", link.id).eq("status", "pending").gt("expires_at", new Date().toISOString())
          .select("id");
        if (!updated?.length) return json({ error: "not pending" }, 409);
        return json({ ok: true });
      },
    },
  },
});
