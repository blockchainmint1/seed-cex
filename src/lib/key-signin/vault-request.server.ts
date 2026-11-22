import { vaultSignerFromSeed, type VaultSigner } from "./vault-request";

/**
 * Seeds' Vault request signer, from the server-only SEEDS_VAULT_REQUEST_SIGNING_SEED secret.
 * Separate from the one-time X25519 keys each sign-in makes. Null when unset → no Vault requests.
 * Never return or log anything from here except id / publicKey / fingerprint.
 */
export function vaultSigner(): VaultSigner | null {
  const seed = process.env["SEEDS_VAULT_REQUEST_SIGNING_SEED"];
  if (!seed) return null;
  try { return vaultSignerFromSeed(seed); } catch { return null; }
}
