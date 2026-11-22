/**
 * Storage format for keys Seeds holds (1106 pocket keys and short-lived link keypairs).
 * Pure: no env, no network — tested in pocket-key-format.test.ts.
 *
 *   legacy  : base64(iv | tag | ct), AES-256-GCM under SHA-256(SEEDS_DELEGATION_KEY)
 *   "kms1." : "kms1." + base64(KMS-wrapped data key) + "." + base64(iv | tag | ct)
 *             Each stored key gets its own AES-256 data key from AWS KMS GenerateDataKey;
 *             only the KMS-wrapped copy is saved, so every unlock needs a KMS Decrypt call.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const KMS_PREFIX = "kms1.";

/** KMS encryption context purpose (the IAM condition key). */
export const POCKET_KEY_PURPOSE = "pocket-key";

/**
 * Which stored value a key belongs to. It goes into the KMS encryption context, so AWS's log
 * names whose key was unlocked, and a value copied onto another row no longer opens (audit M3).
 */
export type KeyRef = `link:${string}` | `link-request:${string}` | `signin-request:${string}` | "delegation:legacy";

export const linkRef = (linkId: string): KeyRef => `link:${linkId}`;
export const linkRequestRef = (challengeId: string): KeyRef => `link-request:${challengeId}`;
export const signinRequestRef = (challengeId: string): KeyRef => `signin-request:${challengeId}`;
/** Old vault delegations: never KMS-sealed, so a KMS value under this ref is refused. */
export const LEGACY_DELEGATION_REF: KeyRef = "delegation:legacy";

/** KMS encryption context for one stored value: Decrypt fails unless the exact same context is sent. */
export function keyContext(ref: KeyRef): Record<string, string> {
  const [kind, id] = [ref.slice(0, ref.indexOf(":")), ref.slice(ref.indexOf(":") + 1)];
  if (!kind || !id || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error("bad key reference");
  if (ref === LEGACY_DELEGATION_REF) throw new Error("legacy delegations are never sealed with AWS KMS");
  return { "seeds:purpose": POCKET_KEY_PURPOSE, "seeds:ref": ref };
}

/** Pocket-key AWS KMS setup: off (not set), on, or half-set (key id without credentials → refuse, audit M5). */
export function kmsMode(env: { keyId?: string | undefined; accessKeyId?: string | undefined; secret?: string | undefined; region?: string | undefined }): "off" | "on" | "incomplete" {
  if (!env.keyId?.trim()) return "off";
  return env.accessKeyId?.trim() && env.secret?.trim() && env.region?.trim() ? "on" : "incomplete";
}

export function isKmsSealed(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.startsWith(KMS_PREFIX);
}

/** AES-256-GCM with a 32-byte key → base64(iv | tag | ct). */
export function aesSeal(plaintext: string, key: Uint8Array): string {
  if (key.length !== 32) throw new Error("key must be 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function aesOpen(sealed: string, key: Uint8Array): string {
  if (key.length !== 32) throw new Error("key must be 32 bytes");
  const buf = Buffer.from(sealed, "base64");
  if (buf.length < 29) throw new Error("sealed value is too short");
  const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

export function formatKmsSealed(wrappedDataKey: Uint8Array, body: string): string {
  if (!wrappedDataKey.length) throw new Error("missing wrapped data key");
  return `${KMS_PREFIX}${Buffer.from(wrappedDataKey).toString("base64")}.${body}`;
}

export function parseKmsSealed(stored: string): { wrappedDataKey: Uint8Array; body: string } {
  if (!isKmsSealed(stored)) throw new Error("not a KMS-sealed value");
  const rest = stored.slice(KMS_PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot <= 0 || dot === rest.length - 1 || rest.indexOf(".", dot + 1) !== -1) throw new Error("malformed KMS-sealed value");
  return { wrappedDataKey: new Uint8Array(Buffer.from(rest.slice(0, dot), "base64")), body: rest.slice(dot + 1) };
}

/** Re-locking is one-way only: an old-format key may be swapped for a KMS-sealed one, never the reverse. */
export function canRewrap(oldStored: string | null | undefined, newStored: string | null | undefined): boolean {
  return typeof oldStored === "string" && oldStored.length > 0 && !isKmsSealed(oldStored) && isKmsSealed(newStored);
}
