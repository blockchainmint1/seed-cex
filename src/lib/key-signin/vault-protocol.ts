/** Browser/offline-safe protocol copied by SEEDS and Vault. Never trust a key from a QR. */
import { ed25519 } from "@noble/curves/ed25519.js";
import { base64urlnopad } from "@scure/base";
import { POCKET_COINS, accountPath, SEEDS_POCKET } from "@/lib/pockets/coins";

export const VAULT_REQUEST = "hm-seeds-key-vault-request";
export const VAULT_RESPONSE = "hm-seeds-key-vault-response";
export const LIVE_KEY_HOST = "key.seeds.honest.money";
export const LIVE_SEEDS_DOMAIN = "seeds.honest.money";
/** m/<purpose>'/<coin>'/1106' plus up to three more hardened levels. */
const POCKET_PATH = /^m\/(44|84|1852)'\/\d{1,9}'\/1106'(\/\d{1,9}'){0,3}$/;
export const MAX_RESPONSE_CHARS = 64 * 1024;
export const MAX_REQUEST_CHARS = 8192;
export const SCAN_TIMEOUT_MS = 120_000;
export type RequestTrust = Readonly<Record<string, string>>;

// Intentionally unconfigured: SEEDS must provision a dedicated signing key, then
// its independently verified PUBLIC key must be pinned here and in Vault.
// No temporary/test key, QR-supplied key, or unsigned fallback is allowed.
export const SEEDS_REQUEST_KEYS: RequestTrust = Object.freeze({});

export type SignedVaultRequest = {
  type: typeof VAULT_REQUEST;
  v: 2;
  signing_key_id: string;
  request_sig: string;
  domain: string;
  key_host: string;
  challenge_id: string;
  challenge: string;
  recipient_pubkey: string;
  pocket: number;
  issued_at: string;
  expires_at: string;
  paths: string[];
};
export type UnsignedVaultRequest = Omit<SignedVaultRequest, "request_sig">;
const BAD = "The Vault request couldn't be verified. Start again on Seeds.";

/** Canonical UTF-8 bytes, fixed-order JSON tuple; no whitespace or trailing newline. */
export function vaultRequestBytes(r: UnsignedVaultRequest): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify([
      "HME Seeds Vault request",
      r.type,
      r.v,
      r.signing_key_id,
      r.domain,
      r.key_host,
      r.challenge_id,
      r.challenge,
      r.recipient_pubkey,
      r.pocket,
      r.issued_at,
      r.expires_at,
      r.paths,
    ]),
  );
}

function decoded(s: unknown, size: number): Uint8Array {
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]+$/.test(s)) throw new Error(BAD);
  const b = base64urlnopad.decode(s);
  if (b.length !== size || base64urlnopad.encode(b) !== s || !b.some((v) => v !== 0))
    throw new Error(BAD);
  return b;
}

/** Reconstruct only validated fields, verify pinned signer, then enforce strict expiry. */
export function readSignedVaultRequest(
  value: unknown,
  trust: RequestTrust = SEEDS_REQUEST_KEYS,
  now = Date.now(),
): SignedVaultRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(BAD);
  const x = value as Record<string, unknown>;
  const string = (k: string) => {
    const s = x[k];
    if (typeof s !== "string" || !s || s.length > 256) throw new Error(BAD);
    return s;
  };
  if (
    x["type"] !== VAULT_REQUEST ||
    x["v"] !== 2 ||
    x["pocket"] !== SEEDS_POCKET ||
    x["domain"] !== LIVE_SEEDS_DOMAIN ||
    x["key_host"] !== LIVE_KEY_HOST
  )
    throw new Error(BAD);
  const paths = x["paths"];
  // Auditor HK3: a newer Seeds may ask for more coins than this copy knows. Accept any list of
  // well-formed pocket-1106 paths with no duplicates that still includes every coin this copy
  // expects (so Seeds can never drop one). The paths are inside the signed bytes either way.
  const want = POCKET_COINS.map((c) => accountPath(c, SEEDS_POCKET));
  if (
    !Array.isArray(paths) ||
    paths.length > 40 ||
    paths.some((p) => typeof p !== "string" || !POCKET_PATH.test(p)) ||
    new Set(paths).size !== paths.length ||
    want.some((w) => !paths.includes(w))
  )
    throw new Error(BAD);
  const r: SignedVaultRequest = {
    type: VAULT_REQUEST,
    v: 2,
    signing_key_id: string("signing_key_id"),
    request_sig: string("request_sig"),
    domain: LIVE_SEEDS_DOMAIN,
    key_host: LIVE_KEY_HOST,
    challenge_id: string("challenge_id"),
    challenge: string("challenge"),
    recipient_pubkey: string("recipient_pubkey"),
    pocket: SEEDS_POCKET,
    issued_at: string("issued_at"),
    expires_at: string("expires_at"),
    paths: paths as string[],
  };
  if (
    !/^[a-zA-Z0-9_-]{1,64}$/.test(r.signing_key_id) ||
    !/^[a-f0-9]{32}$/.test(r.challenge_id) ||
    !/^[a-f0-9]{48}$/.test(r.challenge)
  )
    throw new Error(BAD);
  decoded(r.recipient_pubkey, 32);
  const issued = Date.parse(r.issued_at),
    expires = Date.parse(r.expires_at);
  if (
    !Number.isFinite(issued) ||
    !Number.isFinite(expires) ||
    new Date(issued).toISOString() !== r.issued_at ||
    new Date(expires).toISOString() !== r.expires_at ||
    expires <= issued ||
    expires - issued > 600_000
  )
    throw new Error(BAD);
  const key = Object.hasOwn(trust, r.signing_key_id) ? trust[r.signing_key_id] : undefined;
  if (!key)
    throw new Error(
      "Vault linking is waiting for Seeds' verified signing key. Use your coin or wallet instead.",
    );
  if (
    !ed25519.verify(decoded(r.request_sig, 64), vaultRequestBytes(r), decoded(key, 32), {
      zip215: false,
    })
  )
    throw new Error(BAD);
  if (expires <= now || issued > now + 60_000)
    throw new Error(
      "This Vault request has expired or your clock is wrong. Check the time and start again on Seeds.",
    );
  return r;
}

export function parseSignedVaultRequest(
  text: string,
  trust: RequestTrust = SEEDS_REQUEST_KEYS,
): SignedVaultRequest {
  if (text.length > MAX_REQUEST_CHARS) throw new Error(BAD);
  return readSignedVaultRequest(JSON.parse(text), trust);
}
