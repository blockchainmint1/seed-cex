/**
 * Server-side envelope encryption for delegated trading keys.
 *
 * A delegated key is a *branch* key (m/44'/0'/9'/0/0), never the seed. It is
 * stored as AES-256-GCM ciphertext under SEEDS_DELEGATION_KEY, so a database
 * dump alone is inert.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const raw = process.env.SEEDS_DELEGATION_KEY;
  if (!raw) throw new Error("SEEDS_DELEGATION_KEY is not configured");
  return createHash("sha256").update(raw).digest();
}

export function encryptDelegatedKey(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptDelegatedKey(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}
