import { createFileRoute } from "@tanstack/react-router";

// Seeds' PUBLIC Vault request key, so anyone can compare it with the copy pinned in
// Seeds Key and HME Vault. Vault never fetches this (it stays offline); it is one of the
// independent places a person checks before pinning. No private data.
export const Route = createFileRoute("/api/public/key-signin/vault-signer")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/key-signin/signin.server")).corsPreflight(),
      GET: async () => {
        const { corsJson } = await import("@/lib/key-signin/signin.server");
        const { vaultSigner } = await import("@/lib/key-signin/vault-request.server");
        const { vaultRequestFor, VAULT_EXAMPLE_SOURCE } = await import("@/lib/key-signin/vault-request");
        const s = vaultSigner();
        if (!s) return corsJson({ error: "not_configured" }, 503);
        return corsJson({
          type: "hm-seeds-vault-request-signer",
          algorithm: "Ed25519",
          signing_key_id: s.id,
          public_key: s.publicKey,
          public_key_encoding: "base64url, no padding, 32 bytes",
          fingerprint_sha256: s.fingerprint,
          fingerprint_of: "SHA-256 of the 32 decoded public-key bytes, lowercase hex",
          status: "active",
          example_request: vaultRequestFor(VAULT_EXAMPLE_SOURCE, s),
        });
      },
    },
  },
});
