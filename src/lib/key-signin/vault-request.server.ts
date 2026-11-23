import { base64 } from "@scure/base";
import {
  VAULT_KMS_SIGNING_KEY_ID, vaultKeyInfo, vaultSignerFromSeed,
  type AsyncVaultSigner, type VaultSigner,
} from "./vault-request";

/**
 * Seeds' Vault request signer. Bobby (Nov 23 2026): the key lives in AWS KMS (Ed25519, SEEDS_VAULT_KMS_KEY),
 * so the private half never leaves AWS and every signature is logged there. Until that key is set, the old
 * server-only SEEDS_VAULT_REQUEST_SIGNING_SEED still works; once the KMS key is set it always wins and the
 * seed must be deleted. Half set up (KMS key without the AWS login) = no signer, never a silent fallback.
 * Never return or log anything from here except id / publicKey / fingerprint.
 */
const KMS_ENV = "SEEDS_VAULT_KMS_KEY";
// Ed25519 SubjectPublicKeyInfo prefix (id-Ed25519), then the 32 raw bytes.
const ED25519_SPKI_PREFIX = "302a300506032b6570032100";

function kmsLoginSet(): boolean {
  return Boolean(process.env.SEEDS_KMS_ACCESS_KEY_ID && process.env.SEEDS_KMS_SECRET_ACCESS_KEY && process.env.SEEDS_KMS_REGION);
}

/** Which signer would be used, without any network call. */
export function vaultSignerMode(): "kms" | "seed" | "half_set_up" | "none" {
  if (process.env[KMS_ENV]?.trim()) return kmsLoginSet() ? "kms" : "half_set_up";
  return process.env["SEEDS_VAULT_REQUEST_SIGNING_SEED"] ? "seed" : "none";
}

export function vaultSignerConfigured(): boolean {
  const m = vaultSignerMode();
  return m === "kms" || m === "seed";
}

/** Old seed-based signer (only when no KMS key is set). */
export function vaultSigner(): VaultSigner | null {
  if (vaultSignerMode() !== "seed") return null;
  try { return vaultSignerFromSeed(process.env["SEEDS_VAULT_REQUEST_SIGNING_SEED"]!); } catch { return null; }
}

/** Ed25519 public key from KMS GetPublicKey's DER answer. */
export function ed25519FromSpki(spki: Uint8Array): Uint8Array {
  const h = Array.from(spki, (b) => b.toString(16).padStart(2, "0")).join("");
  if (spki.length !== 44 || !h.startsWith(ED25519_SPKI_PREFIX)) throw new Error("KMS key is not an Ed25519 public key");
  return spki.slice(12);
}

// Finished values only (Workers rule): the public key, per KMS key id.
const pubCache = new Map<string, Uint8Array>();

async function kmsVaultSigner(): Promise<AsyncVaultSigner> {
  const keyId = process.env[KMS_ENV]!.trim();
  const { kmsCall } = await import("../lock/kms.server");
  let pub = pubCache.get(keyId);
  if (!pub) {
    const r = await kmsCall<{ PublicKey: string; KeySpec: string; KeyUsage: string }>("GetPublicKey", { KeyId: keyId });
    if (r.KeySpec !== "ECC_NIST_EDWARDS25519" || r.KeyUsage !== "SIGN_VERIFY") throw new Error("Vault KMS key must be ECC_NIST_EDWARDS25519 / SIGN_VERIFY");
    pub = ed25519FromSpki(base64.decode(r.PublicKey));
    pubCache.set(keyId, pub);
  }
  return Object.freeze({
    id: VAULT_KMS_SIGNING_KEY_ID,
    ...vaultKeyInfo(pub),
    async sign(bytes: Uint8Array) {
      const r = await kmsCall<{ Signature: string }>("Sign", {
        KeyId: keyId, Message: base64.encode(bytes), MessageType: "RAW", SigningAlgorithm: "ED25519_SHA_512",
      });
      return base64.decode(r.Signature);
    },
  });
}

/** The signer the manifest and public key page use. Null when not configured (or half set up). */
export async function activeVaultSigner(): Promise<AsyncVaultSigner | null> {
  const mode = vaultSignerMode();
  if (mode === "half_set_up") { console.error("[vault-signer] SEEDS_VAULT_KMS_KEY is set but the AWS login isn't; Vault requests are off"); return null; }
  if (mode === "kms") return kmsVaultSigner();
  const s = vaultSigner();
  return s ? Object.freeze({ id: s.id, publicKey: s.publicKey, fingerprint: s.fingerprint, sign: async (b: Uint8Array) => s.sign(b) }) : null;
}
