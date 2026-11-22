/**
 * Server-side envelope encryption for keys Seeds holds: members' 1106 pocket keys
 * (account keys for pocket 1106 only, never the seed) and short-lived link keypairs.
 *
 * When SEEDS_POCKET_KMS_KEY is set, every new key is sealed with its own data key from
 * AWS KMS (format in pocket-key-format.ts) and every unlock is a logged KMS Decrypt call.
 * There is no silent fallback: if KMS is configured but unreachable, sealing and
 * unlocking fail. Older values sealed under SEEDS_DELEGATION_KEY still open, and
 * Admin → Settings re-locks stored pocket keys under KMS (one way only).
 */
import { createHash } from "node:crypto";
import { base64 } from "@scure/base";
import { kmsCall } from "./lock/kms.server";
import { POCKET_KEY_CONTEXT, aesOpen, aesSeal, formatKmsSealed, isKmsSealed, parseKmsSealed } from "./pocket-key-format";

function legacyKey(): Buffer {
  const raw = process.env.SEEDS_DELEGATION_KEY;
  if (!raw) throw new Error("SEEDS_DELEGATION_KEY is not configured");
  return createHash("sha256").update(raw).digest();
}

function pocketKmsKeyId(): string | null {
  return process.env.SEEDS_POCKET_KMS_KEY?.trim() || null;
}

/** True when new keys are sealed under AWS KMS. */
export function pocketKmsConfigured(): boolean {
  return Boolean(pocketKmsKeyId() && process.env.SEEDS_KMS_ACCESS_KEY_ID && process.env.SEEDS_KMS_SECRET_ACCESS_KEY && process.env.SEEDS_KMS_REGION);
}

/** Seal with the old single-password scheme. Only used when KMS isn't configured. */
function legacySeal(plaintext: string): string {
  return aesSeal(plaintext, legacyKey());
}

async function kmsSeal(plaintext: string): Promise<string> {
  const keyId = pocketKmsKeyId()!;
  const r = await kmsCall<{ Plaintext: string; CiphertextBlob: string }>("GenerateDataKey", {
    KeyId: keyId, KeySpec: "AES_256", EncryptionContext: POCKET_KEY_CONTEXT,
  });
  const dataKey = base64.decode(r.Plaintext);
  try {
    return formatKmsSealed(base64.decode(r.CiphertextBlob), aesSeal(plaintext, dataKey));
  } finally {
    dataKey.fill(0);
  }
}

async function kmsOpen(stored: string): Promise<string> {
  const keyId = pocketKmsKeyId();
  if (!keyId) throw new Error("This key is locked with AWS KMS, but SEEDS_POCKET_KMS_KEY is not configured");
  const { wrappedDataKey, body } = parseKmsSealed(stored);
  const r = await kmsCall<{ Plaintext: string }>("Decrypt", {
    CiphertextBlob: base64.encode(wrappedDataKey), KeyId: keyId, EncryptionContext: POCKET_KEY_CONTEXT,
  });
  const dataKey = base64.decode(r.Plaintext);
  try {
    return aesOpen(body, dataKey);
  } finally {
    dataKey.fill(0);
  }
}

/** Seal a key for storage: AWS KMS when configured, otherwise the old single password. */
export async function encryptDelegatedKey(plaintext: string): Promise<string> {
  return pocketKmsConfigured() ? kmsSeal(plaintext) : legacySeal(plaintext);
}

/** Open a stored key (either format). */
export async function decryptDelegatedKey(stored: string): Promise<string> {
  return isKmsSealed(stored) ? kmsOpen(stored) : aesOpen(stored, legacyKey());
}

/**
 * Re-lock an old-format value under KMS and prove the new value opens to the same key
 * before returning it. Throws when KMS isn't configured or the value is already KMS-sealed.
 */
export async function rewrapUnderKms(oldStored: string): Promise<string> {
  if (!pocketKmsConfigured()) throw new Error("AWS KMS for pocket keys is not configured");
  if (isKmsSealed(oldStored)) throw new Error("already locked with AWS KMS");
  const plain = aesOpen(oldStored, legacyKey());
  const next = await kmsSeal(plain);
  if ((await kmsOpen(next)) !== plain) throw new Error("re-locked key did not open to the same value");
  return next;
}
