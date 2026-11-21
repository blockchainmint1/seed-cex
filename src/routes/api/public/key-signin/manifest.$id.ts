import { createFileRoute } from "@tanstack/react-router";

// The Seeds Key page reads this after scanning Seeds' QR. Repeatable until submit.
export const Route = createFileRoute("/api/public/key-signin/manifest/$id")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/key-signin/signin.server")).corsPreflight(),
      GET: async ({ request, params }) => {
        const { corsJson } = await import("@/lib/key-signin/signin.server");
        const { ALLOWED_CHAINS, OPTIONAL_CHAINS, KEY_FORMATS, linkDomainFor } = await import("@/lib/hme-link.server");
        const { POCKET_SPECS, accountPath, FIRST_POCKET } = await import("@/lib/pockets/coins");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (!/^[A-Za-z0-9_-]{8,64}$/.test(params.id)) return corsJson({ error: "expired" }, 404);
        const { data: r } = await supabaseAdmin.from("key_signin_requests")
          .select("challenge_id, challenge, recipient_pubkey, expires_at, consumed_at").eq("challenge_id", params.id).maybeSingle();
        if (!r || r.consumed_at || new Date(r.expires_at) < new Date()) return corsJson({ error: "expired" }, 404);
        const origin = new URL(request.url).origin;
        const chain = (c: (typeof ALLOWED_CHAINS)[number] | (typeof OPTIONAL_CHAINS)[number]) => ({
          chain: c, path: accountPath(c, FIRST_POCKET), curve: POCKET_SPECS[c].curve,
          format: (KEY_FORMATS as Record<string, string>)[c] ?? "bip32",
        });
        return corsJson({
          type: "seeds-key-signin",
          version: 1,
          app_name: "Seeds Exchange",
          origin,
          domain: linkDomainFor(request),
          challenge_id: r.challenge_id,
          challenge: r.challenge,
          recipient_pubkey: r.recipient_pubkey,
          expires_at: r.expires_at,
          submit_url: `${origin}/api/public/key-signin/submit`,
          kinds: ["coin", "evm", "sol"],
          // Paths are shown for pocket 1106. If submit answers 409 {error:"use_pocket", account:N}, derive again on pocket N.
          pocket: FIRST_POCKET,
          request: ALLOWED_CHAINS.map(chain),
          request_optional: OPTIONAL_CHAINS.map(chain),
        });
      },
    },
  },
});
