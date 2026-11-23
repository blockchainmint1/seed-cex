import { createFileRoute } from "@tanstack/react-router";

// Seeds' PUBLIC Vault request key, so anyone can compare it with the copy pinned in
// Seeds Key and HME Vault. Vault never fetches this (it stays offline); it is one of the
// independent places a person checks before pinning. No private data.
const exampleCache = new Map<string, unknown>();

export const Route = createFileRoute("/api/public/key-signin/vault-signer")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/key-signin/signin.server")).corsPreflight(),
      GET: async () => {
        const { corsJson } = await import("@/lib/key-signin/signin.server");
        const { activeVaultSigner, vaultSignerMode } = await import("@/lib/key-signin/vault-request.server");
        const { vaultRequestForAsync, VAULT_EXAMPLE_SOURCE } = await import("@/lib/key-signin/vault-request");
        const s = await activeVaultSigner().catch(() => null);
        if (!s) return corsJson({ error: "not_configured" }, 503);
        // One AWS Sign call per key per server copy, not one per visit (finished values only).
        let example = exampleCache.get(s.id) ?? null;
        if (!example) {
          example = await vaultRequestForAsync(VAULT_EXAMPLE_SOURCE, s).catch(() => null);
          if (example) exampleCache.set(s.id, example);
        }
        return corsJson({
          type: "hm-seeds-vault-request-signer",
          algorithm: "Ed25519",
          signing_key_id: s.id,
          public_key: s.publicKey,
          public_key_encoding: "base64url, no padding, 32 bytes",
          fingerprint_sha256: s.fingerprint,
          fingerprint_of: "SHA-256 of the 32 decoded public-key bytes, lowercase hex",
          status: "active",
          key_storage: vaultSignerMode() === "kms" ? "AWS KMS (private key never leaves AWS)" : "server secret",
          example_request: example,
        });
      },
    },
  },
});
