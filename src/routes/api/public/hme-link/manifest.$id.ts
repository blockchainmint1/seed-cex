import { createFileRoute } from "@tanstack/react-router";
import { ALLOWED_CHAINS, json, optionalRequest } from "@/lib/hme-link.server";
import { requestPaths } from "@/lib/hme-link-rules";

// Repeatable GET until submit (the wallet fetches it twice).
export const Route = createFileRoute("/api/public/hme-link/manifest/$id")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: r } = await supabaseAdmin
          .from("hme_link_requests")
          .select("challenge_id, challenge, recipient_pubkey, expires_at, consumed_at, user_id")
          .eq("challenge_id", params.id)
          .maybeSingle();
        if (!r || r.consumed_at || new Date(r.expires_at) < new Date()) return json({ error: "expired" }, 404);
        const origin = new URL(request.url).origin;
        // "Add new coins": a member who is already linked is asked for the same pocket number, so nothing moves.
        const { data: active } = await supabaseAdmin.from("hme_links")
          .select("account, paths").eq("user_id", r.user_id).eq("status", "active").maybeSingle();
        const paths = requestPaths(active ? { account: active.account, paths: active.paths as string[] } : null);
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
          request: ALLOWED_CHAINS.map((c) => ({ chain: c, path: paths.core[c] })),
          // Extra pockets a wallet MAY include (access mode only). A wallet skips any coin it can't make a key for,
          // so Seeds can list a coin before HME Wallet supports it. `format` names the exact key method (see docs/hme-wallet-extra-pockets.md).
          request_optional: optionalRequest(paths.optional),
        });
      },
    },
  },
});
