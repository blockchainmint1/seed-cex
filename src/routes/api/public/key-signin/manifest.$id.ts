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
        const { pairingCode, keyHostOf } = await import("@/lib/key-signin/rules");
        if (!/^[A-Za-z0-9_-]{8,64}$/.test(params.id)) return corsJson({ error: "expired" }, 404);
        const { data: r } = await supabaseAdmin.from("key_signin_requests")
          .select("challenge_id, challenge, recipient_pubkey, expires_at, consumed_at, created_at, vault_request").eq("challenge_id", params.id).maybeSingle();
        if (!r || r.consumed_at || new Date(r.expires_at) < new Date()) return corsJson({ error: "expired" }, 404);
        const origin = new URL(request.url).origin;
        const { activeVaultSigner } = await import("@/lib/key-signin/vault-request.server");
        const { vaultRequestForAsync, storedVaultRequestMatches, vaultSignatureOk } = await import("@/lib/key-signin/vault-request");
        const { vaultRequestBytes } = await import("@/lib/key-signin/vault-protocol");
        const { base64urlnopad } = await import("@scure/base");
        const domain = linkDomainFor(request);
        const keyHost = keyHostOf(process.env.SEEDS_KEY_URL);
        const issuedAt = new Date(r.created_at).toISOString();
        const expiresAt = new Date(r.expires_at).toISOString();
        // HME Vault (signed request v2): only on the live addresses with Seeds' signer configured;
        // otherwise omitted and Seeds Key hides the Vault choice. Mirrors the fields below exactly.
        // Signed once per sign-in request and stored (the key is in AWS KMS: one Sign call, not one per page load).
        const source = {
          domain, key_host: keyHost, challenge_id: r.challenge_id, challenge: r.challenge,
          recipient_pubkey: r.recipient_pubkey, pocket: FIRST_POCKET, issued_at: issuedAt, expires_at: expiresAt,
        };
        let vaultRequest = null as Awaited<ReturnType<typeof vaultRequestForAsync>>;
        try {
          const signer = await activeVaultSigner();
          const stored = r.vault_request as unknown;
          if (signer && storedVaultRequestMatches(stored, source, signer.id)
            && vaultSignatureOk(base64urlnopad.decode(stored.request_sig), vaultRequestBytes(stored), signer.publicKey)) {
            vaultRequest = stored;
          } else if (signer) {
            vaultRequest = await vaultRequestForAsync(source, signer);
            if (vaultRequest) await supabaseAdmin.from("key_signin_requests").update({ vault_request: vaultRequest as never }).eq("challenge_id", r.challenge_id);
          }
        } catch (e) {
          // Vault is optional: without a signed request, Seeds Key hides the Vault choice and coin / wallet sign-in carries on.
          console.error("[vault-signer] couldn't sign the Vault request", e instanceof Error ? e.message.slice(0, 200) : "error");
          vaultRequest = null;
        }
        const chain = (c: (typeof ALLOWED_CHAINS)[number] | (typeof OPTIONAL_CHAINS)[number]) => ({
          chain: c, path: accountPath(c, FIRST_POCKET), curve: POCKET_SPECS[c].curve,
          format: (KEY_FORMATS as Record<string, string>)[c] ?? "bip32",
        });
        return corsJson({
          type: "seeds-key-signin",
          version: 1,
          app_name: "Seeds Exchange",
          origin,
          domain,
          challenge_id: r.challenge_id,
          challenge: r.challenge,
          // The Seeds tab shows the same three digits; continue only when they match.
          pairing_code: pairingCode(r.challenge),
          recipient_pubkey: r.recipient_pubkey,
          // Wallet sign-ins sign these exact values (Sign-In with Ethereum / Solana: domain = key_host,
          // Issued At = issued_at, Expiration Time = expires_at, Nonce = challenge).
          key_host: keyHost,
          issued_at: issuedAt,
          expires_at: expiresAt,
          submit_url: `${origin}/api/public/key-signin/submit`,
          kinds: ["coin", "evm", "sol"],
          // Seeds always uses pocket 1106 (SEEDS_POCKET), also after a revoke. A 409 {error:"use_pocket"} answer would name the pocket to derive.
          pocket: FIRST_POCKET,
          request: ALLOWED_CHAINS.map(chain),
          request_optional: OPTIONAL_CHAINS.map(chain),
          ...(vaultRequest ? { vault_request: vaultRequest } : {}),
        });
      },
    },
  },
});
