/**
 * Seeds' half of the lock, held in AWS KMS (asymmetric ECC_SECG_P256K1, SIGN_VERIFY).
 * The private key never leaves KMS: Seeds sends the 32-byte transaction digest and gets a
 * DER signature back, which we force to low-S (Bitcoin-family nodes reject high-S) and
 * verify against the KMS public key before it is ever placed in a transaction.
 *
 * One KMS key per chain (TXC, ISK). Each lock still has its own address because the member
 * half is per-member. Rotating = create a new KMS key and point the env var at it; old locks
 * keep the seeds_pub stored on their row, so signing refuses if the key no longer matches.
 *
 * Env (server only): SEEDS_KMS_ACCESS_KEY_ID, SEEDS_KMS_SECRET_ACCESS_KEY, SEEDS_KMS_REGION,
 * SEEDS_LOCK_KMS_KEY_TXC, SEEDS_LOCK_KMS_KEY_ISK (key ARN or alias ARN).
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { base64 } from "@scure/base";
import { signV4 } from "@/lib/email/ses.server";
import type { LockChain } from "./script";

const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
// DER SubjectPublicKeyInfo prefix for an uncompressed secp256k1 key (id-ecPublicKey + secp256k1).
const SPKI_PREFIX = "3056301006072a8648ce3d020106052b8104000a034200";

export type SeedsSigner = { publicKey: Uint8Array; source: "kms" | "local"; sign(digest: Uint8Array): Promise<Uint8Array> };

const keyEnv = (chain: LockChain) => (chain === "TXC" ? "SEEDS_LOCK_KMS_KEY_TXC" : "SEEDS_LOCK_KMS_KEY_ISK");

export function kmsLockConfigured(chain: LockChain): boolean {
  return Boolean(process.env.SEEDS_KMS_ACCESS_KEY_ID && process.env.SEEDS_KMS_SECRET_ACCESS_KEY && process.env.SEEDS_KMS_REGION && process.env[keyEnv(chain)]);
}

/** KMS GetPublicKey returns DER SPKI; we need the 33-byte compressed point. */
export function spkiToCompressed(spki: Uint8Array): Uint8Array {
  const hex = Array.from(spki, (b) => b.toString(16).padStart(2, "0")).join("");
  if (spki.length !== 88 || !hex.startsWith(SPKI_PREFIX)) throw new Error("KMS key is not a secp256k1 public key");
  return secp256k1.Point.fromBytes(spki.slice(23)).toBytes(true);
}

/** KMS may return high-S; flip to low-S and re-encode as strict DER. */
export function toLowSDer(der: Uint8Array): Uint8Array {
  const sig = secp256k1.Signature.fromBytes(der, "der");
  const s = sig.s > N / 2n ? N - sig.s : sig.s;
  return new secp256k1.Signature(sig.r, s).toBytes("der");
}

async function kms<T>(target: "Sign" | "GetPublicKey", body: Record<string, unknown>): Promise<T> {
  const accessKeyId = process.env.SEEDS_KMS_ACCESS_KEY_ID!;
  const secret = process.env.SEEDS_KMS_SECRET_ACCESS_KEY!;
  const region = process.env.SEEDS_KMS_REGION!.trim();
  const host = `kms.${region}.amazonaws.com`;
  const raw = JSON.stringify(body);
  const headers = signV4({
    method: "POST", host, path: "/", body: raw, region, service: "kms", accessKeyId, secret, now: new Date(),
    contentType: "application/x-amz-json-1.1", extraHeaders: { "x-amz-target": `TrentService.${target}` },
  });
  const res = await fetch(`https://${host}/`, { method: "POST", headers, body: raw, signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { const j = JSON.parse(text) as { message?: string; Message?: string; __type?: string }; msg = `${j.__type ?? ""} ${j.message ?? j.Message ?? ""}`.trim() || msg; } catch { /* keep raw */ }
    throw new Error(`KMS ${target} ${res.status}: ${msg}`);
  }
  return JSON.parse(text) as T;
}

const pubCache = new Map<string, Uint8Array>();

export async function kmsSeedsSigner(chain: LockChain): Promise<SeedsSigner> {
  if (!kmsLockConfigured(chain)) throw new Error(`KMS signing for ${chain} is not configured`);
  const keyId = process.env[keyEnv(chain)]!.trim();
  let publicKey = pubCache.get(keyId);
  if (!publicKey) {
    const r = await kms<{ PublicKey: string; KeySpec: string; KeyUsage: string }>("GetPublicKey", { KeyId: keyId });
    if (r.KeySpec !== "ECC_SECG_P256K1" || r.KeyUsage !== "SIGN_VERIFY") throw new Error("KMS key must be ECC_SECG_P256K1 / SIGN_VERIFY");
    publicKey = spkiToCompressed(base64.decode(r.PublicKey));
    pubCache.set(keyId, publicKey);
  }
  const pub = publicKey;
  return {
    publicKey: pub, source: "kms",
    async sign(digest) {
      if (digest.length !== 32) throw new Error("digest must be 32 bytes");
      const r = await kms<{ Signature: string }>("Sign", { KeyId: keyId, Message: base64.encode(digest), MessageType: "DIGEST", SigningAlgorithm: "ECDSA_SHA_256" });
      const der = toLowSDer(base64.decode(r.Signature));
      if (!secp256k1.verify(der, digest, pub, { prehash: false, format: "der", lowS: true })) throw new Error("KMS signature did not verify");
      return der;
    },
  };
}

/* ------------------- Seeds gas wallet (Ethereum network fees) ------------------- */

const GAS_KEY_ENV = "SEEDS_GAS_KMS_KEY_ETH";

export function kmsGasConfigured(): boolean {
  return Boolean(process.env.SEEDS_KMS_ACCESS_KEY_ID && process.env.SEEDS_KMS_SECRET_ACCESS_KEY && process.env.SEEDS_KMS_REGION && process.env[GAS_KEY_ENV]);
}

/**
 * Seeds' Ethereum gas wallet: a separate KMS key (never the lock keys) that only tops up
 * members' pockets with the ETH a route's network fee needs. Returns the public key and a
 * digest signer that yields low-S r/s plus the recovery bit Ethereum needs.
 */
export async function kmsGasSigner(): Promise<{ publicKey: Uint8Array; sign(digest: Uint8Array): Promise<{ r: bigint; s: bigint; recovery: number }> }> {
  if (!kmsGasConfigured()) throw new Error("Seeds' gas wallet is not set up");
  const keyId = process.env[GAS_KEY_ENV]!.trim();
  let publicKey = pubCache.get(keyId);
  if (!publicKey) {
    const r = await kms<{ PublicKey: string; KeySpec: string; KeyUsage: string }>("GetPublicKey", { KeyId: keyId });
    if (r.KeySpec !== "ECC_SECG_P256K1" || r.KeyUsage !== "SIGN_VERIFY") throw new Error("KMS key must be ECC_SECG_P256K1 / SIGN_VERIFY");
    publicKey = spkiToCompressed(base64.decode(r.PublicKey));
    pubCache.set(keyId, publicKey);
  }
  const pub = publicKey;
  return {
    publicKey: pub,
    async sign(digest) {
      if (digest.length !== 32) throw new Error("digest must be 32 bytes");
      const r = await kms<{ Signature: string }>("Sign", { KeyId: keyId, Message: base64.encode(digest), MessageType: "DIGEST", SigningAlgorithm: "ECDSA_SHA_256" });
      return recoverableFromDer(toLowSDer(base64.decode(r.Signature)), digest, pub);
    },
  };
}

/** Find the recovery bit that makes a DER signature recover to `pub` (Ethereum's v). */
export function recoverableFromDer(der: Uint8Array, digest: Uint8Array, pub: Uint8Array): { r: bigint; s: bigint; recovery: number } {
  const sig = secp256k1.Signature.fromBytes(der, "der");
  const want = secp256k1.Point.fromBytes(pub).toBytes(true);
  for (const bit of [0, 1]) {
    try {
      const got = sig.addRecoveryBit(bit).recoverPublicKey(digest).toBytes(true);
      if (got.length === want.length && got.every((b, i) => b === want[i])) return { r: sig.r, s: sig.s, recovery: bit };
    } catch { /* try the other bit */ }
  }
  throw new Error("KMS signature does not match the gas wallet key");
}
