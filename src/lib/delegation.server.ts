/**
 * Server-side envelope encryption for keys Seeds holds: members' 1106 pocket keys
 * (account keys for pocket 1106 only, never the seed) and short-lived link keypairs.
 *
 * When SEEDS_POCKET_KMS_KEY is set, every new key is sealed with its own data key from
 * AWS KMS (format in pocket-key-format.ts) bound to the row it belongs to (KeyRef), and
 * every unlock is a logged KMS Decrypt call. No fallback: a half-set KMS setup, or KMS
 * being unreachable, makes sealing and unlocking fail. Older values sealed under
 * SEEDS_DELEGATION_KEY still open while that setting exists; Admin → Settings re-locks
 * stored pocket keys under KMS (one way only), after which the old setting is retired.
 */
import { createHash } from "node:crypto";
import { base64 } from "@scure/base";
import { kmsCall } from "./lock/kms.server";
import { aesOpen, aesSeal, formatKmsSealed, isKmsSealed, keyContext, kmsMode, parseKmsSealed, type KeyRef } from "./pocket-key-format";

/** What a member sees when AWS can't be reached (audit M6); the detail goes to the server log only. */
export const KEY_UNLOCK_FAILED = "Seeds couldn't unlock your pocket key right now. Nothing was sent. Try again in a minute.";
const KEY_LOCK_FAILED = "Seeds couldn't secure your pocket key right now, so nothing was saved. Try again in a minute.";

function legacyKey(): Buffer {
  const raw = process.env.SEEDS_DELEGATION_KEY;
  if (!raw) {
    console.error("[pocket-kms] an old-format key was opened, but SEEDS_DELEGATION_KEY has been retired");
    throw new Error(KEY_UNLOCK_FAILED);
  }
  return createHash("sha256").update(raw).digest();
}

function mode() {
  return kmsMode({
    keyId: process.env.SEEDS_POCKET_KMS_KEY, accessKeyId: process.env.SEEDS_KMS_ACCESS_KEY_ID,
    secret: process.env.SEEDS_KMS_SECRET_ACCESS_KEY, region: process.env.SEEDS_KMS_REGION,
  });
}

/** True when new keys are sealed under AWS KMS. */
export function pocketKmsConfigured(): boolean {
  return mode() === "on";
}

/** For Admin → Settings: off / on / incomplete. */
export function pocketKmsState() {
  return mode();
}

/** The old single-password lock still exists in settings (retire after the re-lock, audit M4). */
export function legacyPasswordPresent(): boolean {
  return Boolean(process.env.SEEDS_DELEGATION_KEY);
}

function keyId(): string {
  const m = mode();
  if (m !== "on") {
    console.error(`[pocket-kms] pocket-key KMS is ${m}`);
    throw new Error(m === "incomplete" ? "AWS KMS for pocket keys is only half set up" : "AWS KMS for pocket keys is not configured");
  }
  return process.env.SEEDS_POCKET_KMS_KEY!.trim();
}

async function kmsSeal(plaintext: string, ref: KeyRef): Promise<string> {
  const context = keyContext(ref);
  let r: { Plaintext: string; CiphertextBlob: string };
  try {
    r = await kmsCall("GenerateDataKey", { KeyId: keyId(), KeySpec: "AES_256", EncryptionContext: context });
  } catch (e) {
    console.error("[pocket-kms] GenerateDataKey failed", e instanceof Error ? e.message : e);
    throw new Error(KEY_LOCK_FAILED);
  }
  const dataKey = base64.decode(r.Plaintext);
  try {
    return formatKmsSealed(base64.decode(r.CiphertextBlob), aesSeal(plaintext, dataKey));
  } finally {
    dataKey.fill(0);
  }
}

async function kmsOpen(stored: string, ref: KeyRef): Promise<string> {
  let dataKey: Uint8Array;
  try {
    const context = keyContext(ref);
    const { wrappedDataKey, body } = parseKmsSealed(stored);
    const r = await kmsCall<{ Plaintext: string }>("Decrypt", { CiphertextBlob: base64.encode(wrappedDataKey), KeyId: keyId(), EncryptionContext: context });
    dataKey = base64.decode(r.Plaintext);
    try {
      return aesOpen(body, dataKey);
    } finally {
      dataKey.fill(0);
    }
  } catch (e) {
    console.error("[pocket-kms] unlock failed", ref, e instanceof Error ? e.message : e);
    throw new Error(KEY_UNLOCK_FAILED);
  }
}

/** Seal a key for storage, bound to the row it belongs to. AWS KMS when set up; refused when half set up. */
export async function encryptDelegatedKey(plaintext: string, ref: KeyRef): Promise<string> {
  const m = mode();
  if (m === "incomplete") {
    console.error("[pocket-kms] SEEDS_POCKET_KMS_KEY is set but the AWS login settings are incomplete");
    throw new Error(KEY_LOCK_FAILED);
  }
  return m === "on" ? kmsSeal(plaintext, ref) : aesSeal(plaintext, legacyKey());
}

/** Open a stored key (either format). `ref` must name the same row it was sealed for. */
export async function decryptDelegatedKey(stored: string, ref: KeyRef): Promise<string> {
  return isKmsSealed(stored) ? kmsOpen(stored, ref) : aesOpen(stored, legacyKey());
}

/**
 * Re-lock an old-format value under KMS and prove the new value opens to the same key
 * before returning it. Throws when KMS isn't set up or the value is already KMS-sealed.
 */
export async function rewrapUnderKms(oldStored: string, ref: KeyRef): Promise<string> {
  if (mode() !== "on") throw new Error("AWS KMS for pocket keys is not configured");
  if (isKmsSealed(oldStored)) throw new Error("already locked with AWS KMS");
  const plain = aesOpen(oldStored, legacyKey());
  const next = await kmsSeal(plain, ref);
  if ((await kmsOpen(next, ref)) !== plain) throw new Error("re-locked key did not open to the same value");
  return next;
}
