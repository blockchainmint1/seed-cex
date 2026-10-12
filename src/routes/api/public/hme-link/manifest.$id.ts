import { createFileRoute } from "@tanstack/react-router";
import { ALLOWED_CHAINS, REQUEST_PATHS, json } from "@/lib/hme-link.server";

// Repeatable GET until submit (the wallet fetches it twice).
export const Route = createFileRoute("/api/public/hme-link/manifest/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: r } = await supabaseAdmin
          .from("hme_link_requests")
          .select("challenge_id, challenge, recipient_pubkey, expires_at, consumed_at")
          .eq("challenge_id", params.id)
          .maybeSingle();
        if (!r || r.consumed_at || new Date(r.expires_at) < new Date()) return json({ error: "expired" }, 404);
        const origin = new URL(request.url).origin;
        return json({
          type: "hm-link-delegate",
          version: 1,
          app_name: "Seeds Exchange",
          origin,
          challenge_id: r.challenge_id,
          challenge: r.challenge,
          recipient_pubkey: r.recipient_pubkey,
          expires_at: r.expires_at,
          submit_url: `${origin}/api/public/hme-link/submit`,
          revoke_url: `${origin}/api/public/hme-link/revoke`,
          request: ALLOWED_CHAINS.map((c) => ({ chain: c, path: REQUEST_PATHS[c] })),
        });
      },
    },
  },
});
