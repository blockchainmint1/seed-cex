/**
 * Seeds' side of the HME Vault link, signed-request v2 (Bobby, Nov 22 2026).
 *
 * Seeds signs one `vault_request` per key sign-in and puts it inside the normal
 * manifest. Seeds Key shows it as a QR; the offline HME Vault phone checks the
 * signature against Seeds' public key (pinned in its app, never taken from a QR)
 * before it derives anything. The bytes signed come from vault-protocol.ts, a
 * verbatim copy of Seeds Key's file, so all three projects sign/verify the same bytes.
 *
 * Pure: the signing seed is passed in by vault-request.server.ts and never leaves it.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64urlnopad, hex } from "@scure/base";
import { POCKET_COINS, accountPath, SEEDS_POCKET } from "../pockets/coins";
import {
  LIVE_KEY_HOST, LIVE_SEEDS_DOMAIN, VAULT_REQUEST, vaultRequestBytes,
  type SignedVaultRequest, type UnsignedVaultRequest,
} from "./vault-protocol";

/** Stable id Key and Vault pin next to the public key. A new key gets a new id (see docs/vault-request-signer.md). */
export const VAULT_SIGNING_KEY_ID = "seeds-vault-2026-11";
/** HKDF label turning the stored random secret into the Ed25519 private key. Changing it = a new key. */
export const VAULT_SIGNER_LABEL = "seeds vault request signer v1";
export const MIN_SIGNING_SEED_CHARS = 32;
/** Vault and Key refuse anything longer (vault-protocol.ts). */
export const MAX_VAULT_REQUEST_MS = 600_000;

const enc = new TextEncoder();

export type VaultSigner = Readonly<{
  id: string;
  /** 32 bytes, base64url without padding. */
  publicKey: string;
  /** SHA-256 of the 32 decoded public-key bytes, lowercase hex. */
  fingerprint: string;
  sign(bytes: Uint8Array): Uint8Array;
}>;

export function vaultSignerFromSeed(seedText: string, id: string = VAULT_SIGNING_KEY_ID): VaultSigner {
  if (typeof seedText !== "string" || seedText.length < MIN_SIGNING_SEED_CHARS) throw new Error("Vault request signer is not configured");
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error("Bad signing key id");
  const secret = hkdf(sha256, enc.encode(seedText), enc.encode("HME Seeds Vault"), enc.encode(VAULT_SIGNER_LABEL), 32);
  const pub = ed25519.getPublicKey(secret);
  return Object.freeze({
    id,
    publicKey: base64urlnopad.encode(pub),
    fingerprint: hex.encode(sha256(pub)),
    sign: (bytes: Uint8Array) => ed25519.sign(bytes, secret),
  });
}

/** The manifest fields the Vault request must mirror exactly (Key compares them one by one). */
export type VaultRequestSource = {
  domain: string; key_host: string | null; challenge_id: string; challenge: string;
  recipient_pubkey: string; pocket: number; issued_at: string; expires_at: string;
};

/** Canonical ISO form only: three millisecond digits and "Z" (2026-11-22T15:13:00.000Z). */
export function canonicalIso(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const t = Date.parse(s);
  return Number.isFinite(t) && new Date(t).toISOString() === s ? t : null;
}

function goodRecipient(s: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(s)) return false;
  try {
    const b = base64urlnopad.decode(s);
    return b.length === 32 && base64urlnopad.encode(b) === s && b.some((v) => v !== 0);
  } catch { return false; }
}

export const VAULT_PATHS: readonly string[] = Object.freeze(POCKET_COINS.map((c) => accountPath(c, SEEDS_POCKET)));

/**
 * The signed request for this sign-in, or null when it can't be one (no signer, a preview
 * address, a pocket other than 1106, odd timestamps). Null → no `vault_request` in the
 * manifest → Seeds Key hides the Vault choice; coin and wallet sign-in carry on unchanged.
 */
export function vaultRequestFor(m: VaultRequestSource, signer: VaultSigner | null): SignedVaultRequest | null {
  if (!signer) return null;
  if (m.domain !== LIVE_SEEDS_DOMAIN || m.key_host !== LIVE_KEY_HOST || m.pocket !== SEEDS_POCKET) return null;
  if (!/^[a-f0-9]{32}$/.test(m.challenge_id) || !/^[a-f0-9]{48}$/.test(m.challenge) || !goodRecipient(m.recipient_pubkey)) return null;
  const issued = canonicalIso(m.issued_at);
  const expires = canonicalIso(m.expires_at);
  if (issued === null || expires === null || expires <= issued || expires - issued > MAX_VAULT_REQUEST_MS) return null;
  const r: UnsignedVaultRequest = {
    type: VAULT_REQUEST, v: 2, signing_key_id: signer.id, domain: LIVE_SEEDS_DOMAIN, key_host: LIVE_KEY_HOST,
    challenge_id: m.challenge_id, challenge: m.challenge, recipient_pubkey: m.recipient_pubkey, pocket: SEEDS_POCKET,
    issued_at: m.issued_at, expires_at: m.expires_at, paths: [...VAULT_PATHS],
  };
  return { ...r, request_sig: base64urlnopad.encode(signer.sign(vaultRequestBytes(r))) };
}

/**
 * Will this sign-in's manifest carry a signed Vault request? Same gates as vaultRequestFor
 * (live Seeds address, live Seeds Key host, signer configured), so the "Use HME Vault"
 * screen can say up front when Vault isn't available here instead of failing on the phone.
 */
export function vaultAvailable(domain: string, keyHost: string | null, hasSigner: boolean): boolean {
  return hasSigner && domain === LIVE_SEEDS_DOMAIN && keyHost === LIVE_KEY_HOST;
}

/**
 * Times stored for a new key sign-in: issued (created_at) and expiry from one clock reading,
 * so the window is exactly the request lifetime and never trips Vault's 10-minute limit.
 */
export function keyRequestWindow(nowMs: number, ttlMs: number): { createdAt: string; expiresAt: string } {
  const now = Math.floor(nowMs);
  return { createdAt: new Date(now).toISOString(), expiresAt: new Date(now + Math.min(ttlMs, MAX_VAULT_REQUEST_MS)).toISOString() };
}

/**
 * Public example signed with the production key, for Vault/Key tests. Long expired, and its
 * recipient is a random public key whose private half was thrown away, so nobody can open
 * anything sealed to it; the challenge matches no Seeds sign-in.
 */
export const VAULT_EXAMPLE_SOURCE: VaultRequestSource = Object.freeze({
  domain: LIVE_SEEDS_DOMAIN, key_host: LIVE_KEY_HOST,
  challenge_id: "0".repeat(31) + "1", challenge: "0".repeat(47) + "1",
  recipient_pubkey: "3EqsiBghHmyfs5TMsNBdKbJKEbo95DJM5WdhNDEQqWo", pocket: SEEDS_POCKET,
  issued_at: "2026-01-01T00:00:00.000Z", expires_at: "2026-01-01T00:10:00.000Z",
});
