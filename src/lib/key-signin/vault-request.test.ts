import { describe, expect, test } from "bun:test";
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { base64urlnopad } from "@scure/base";
import {
  vaultAvailable,
  MAX_VAULT_REQUEST_MS, VAULT_EXAMPLE_SOURCE, VAULT_PATHS, VAULT_SIGNING_KEY_ID, canonicalIso, keyRequestWindow,
  vaultRequestFor, vaultSignerFromSeed, type VaultRequestSource,
} from "./vault-request";
import { readSignedVaultRequest, vaultRequestBytes } from "./vault-protocol";
import { KEY_REQUEST_TTL_MS } from "./rules";

const SEED = "test-only-seed-never-production-0123456789abcdef";
const signer = vaultSignerFromSeed(SEED);
const trust = { [signer.id]: signer.publicKey };

function source(now = Date.now()): VaultRequestSource {
  const w = keyRequestWindow(now, KEY_REQUEST_TTL_MS);
  return {
    domain: "seeds.honest.money", key_host: "key.seeds.honest.money",
    challenge_id: "ab".repeat(16), challenge: "cd".repeat(24),
    recipient_pubkey: base64urlnopad.encode(x25519.getPublicKey(new Uint8Array(32).fill(9))),
    pocket: 1106, issued_at: w.createdAt, expires_at: w.expiresAt,
  };
}

describe("Seeds-signed HME Vault requests (v2)", () => {
  test("Seeds Key's own verifier accepts what Seeds signs", () => {
    const src = source();
    const r = vaultRequestFor(src, signer)!;
    expect(readSignedVaultRequest(r, trust)).toEqual(r);
  });

  test("every field mirrors the manifest exactly", () => {
    const src = source();
    const r = vaultRequestFor(src, signer)!;
    for (const k of ["domain", "key_host", "challenge_id", "challenge", "recipient_pubkey", "pocket", "issued_at", "expires_at"] as const)
      expect(r[k]).toBe(src[k] as never);
    expect(r.type).toBe("hm-seeds-key-vault-request");
    expect(r.v).toBe(2);
    expect(r.signing_key_id).toBe("seeds-vault-2026-11");
    expect(Object.keys(r).sort()).toEqual(["challenge", "challenge_id", "domain", "expires_at", "issued_at", "key_host", "paths", "pocket", "recipient_pubkey", "request_sig", "signing_key_id", "type", "v"]);
  });

  test("the 16 pocket-1106 paths, in the agreed order", () => {
    expect(VAULT_PATHS).toEqual([
      "m/44'/696969'/1106'", "m/44'/969696'/1106'", "m/84'/0'/1106'", "m/44'/2'/1106'", "m/44'/60'/1106'",
      "m/44'/3'/1106'", "m/44'/145'/1106'", "m/44'/133'/1106'", "m/44'/144'/1106'", "m/44'/195'/1106'",
      "m/44'/501'/1106'/0'", "m/44'/5'/1106'", "m/44'/118'/1106'", "m/44'/931'/1106'", "m/1852'/1815'/1106'", "m/44'/128'/1106'",
    ]);
  });

  test("signed bytes are exactly the agreed JSON tuple (no spaces, no newline)", () => {
    const r = vaultRequestFor(source(), signer)!;
    const { request_sig, ...u } = r;
    const want = `["HME Seeds Vault request","hm-seeds-key-vault-request",2,"seeds-vault-2026-11","seeds.honest.money","key.seeds.honest.money","${u.challenge_id}","${u.challenge}","${u.recipient_pubkey}",1106,"${u.issued_at}","${u.expires_at}",${JSON.stringify(VAULT_PATHS)}]`;
    expect(new TextDecoder().decode(vaultRequestBytes(u))).toBe(want);
    // Plain Ed25519 over those bytes, 64-byte signature, canonical base64url.
    const sig = base64urlnopad.decode(request_sig);
    expect(sig.length).toBe(64);
    expect(ed25519.verify(sig, new TextEncoder().encode(want), base64urlnopad.decode(signer.publicKey))).toBe(true);
  });

  test("swapping the recipient, challenge or any field breaks the signature", () => {
    const r = vaultRequestFor(source(), signer)!;
    const other = base64urlnopad.encode(x25519.getPublicKey(new Uint8Array(32).fill(5)));
    for (const bad of [{ recipient_pubkey: other }, { challenge: "ef".repeat(24) }, { challenge_id: "12".repeat(16) }, { signing_key_id: "other" }])
      expect(() => readSignedVaultRequest({ ...r, ...bad }, { ...trust, other: signer.publicKey })).toThrow();
  });

  test("a different signing key is refused", () => {
    const r = vaultRequestFor(source(), vaultSignerFromSeed("another-test-seed-not-production-xxxxxxxxxx"))!;
    expect(() => readSignedVaultRequest(r, trust)).toThrow();
  });

  test("only the live addresses and pocket 1106 get a Vault request", () => {
    const s = source();
    expect(vaultRequestFor({ ...s, domain: "seeds-cex.lovable.app" }, signer)).toBeNull();
    expect(vaultRequestFor({ ...s, key_host: "preview.key.example" }, signer)).toBeNull();
    expect(vaultRequestFor({ ...s, key_host: null }, signer)).toBeNull();
    for (const pocket of [0, 1, 1107, 2105]) expect(vaultRequestFor({ ...s, pocket }, signer)).toBeNull();
    expect(vaultRequestFor(s, null)).toBeNull();
  });

  test("re-linking after a revoke is still pocket 1106", () => {
    expect(vaultRequestFor(source(), signer)!.pocket).toBe(1106);
    expect(VAULT_PATHS.every((p) => p.includes("/1106'"))).toBe(true);
  });

  test("timestamps must be canonical ISO with milliseconds and Z", () => {
    const s = source(Date.parse("2026-11-22T15:13:00.000Z"));
    expect(s.issued_at).toBe("2026-11-22T15:13:00.000Z");
    expect(s.expires_at).toBe("2026-11-22T15:23:00.000Z");
    expect(vaultRequestFor(s, signer)).not.toBeNull();
    for (const bad of ["2026-11-22T15:13:00Z", "2026-11-22T15:13:00.000+00:00", "2026-11-22T12:13:00.000-03:00", "2026-11-22t15:13:00.000z", "2026-11-22 15:13:00.000Z"])
      expect(vaultRequestFor({ ...s, issued_at: bad }, signer)).toBeNull();
    expect(canonicalIso("2026-11-22T15:13:00.000Z")).toBe(Date.parse("2026-11-22T15:13:00.000Z"));
  });

  test("lifetime: exactly 10 minutes is fine, longer or backwards is refused", () => {
    const s = source(Date.parse("2026-11-22T15:13:00.000Z"));
    expect(Date.parse(s.expires_at) - Date.parse(s.issued_at)).toBe(MAX_VAULT_REQUEST_MS);
    expect(vaultRequestFor({ ...s, expires_at: "2026-11-22T15:23:00.001Z" }, signer)).toBeNull();
    expect(vaultRequestFor({ ...s, expires_at: s.issued_at }, signer)).toBeNull();
    expect(keyRequestWindow(0, 3_600_000).expiresAt).toBe(new Date(MAX_VAULT_REQUEST_MS).toISOString());
  });

  test("no secret reaches the request or the public signer fields", () => {
    const r = vaultRequestFor(source(), signer)!;
    const out = JSON.stringify({ r, signer });
    expect(out).not.toContain(SEED);
    expect(Object.keys(signer).sort()).toEqual(["fingerprint", "id", "publicKey", "sign"]);
    expect(JSON.stringify(signer)).not.toContain("sign\"");
    expect(signer.publicKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(signer.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(VAULT_SIGNING_KEY_ID).toBe(signer.id);
  });

  test("a too-short signing secret is refused", () => {
    expect(() => vaultSignerFromSeed("short")).toThrow();
  });

  test("the public example is signed, verifiable, and long expired", () => {
    const ex = vaultRequestFor(VAULT_EXAMPLE_SOURCE, signer)!;
    expect(readSignedVaultRequest(ex, trust, Date.parse("2026-01-01T00:05:00.000Z"))).toEqual(ex);
    expect(() => readSignedVaultRequest(ex, trust)).toThrow(/expired/);
  });

  test("the Use HME Vault screen says Vault is on only where the manifest would carry a signed request", () => {
    expect(vaultAvailable("seeds.honest.money", "key.seeds.honest.money", true)).toBe(true);
    expect(vaultAvailable("seeds.honest.money", "key.seeds.honest.money", false)).toBe(false);
    expect(vaultAvailable("id-preview--x.lovable.app", "key.seeds.honest.money", true)).toBe(false);
    expect(vaultAvailable("seeds.honest.money", "key.evil.com", true)).toBe(false);
    expect(vaultAvailable("seeds.honest.money", null, true)).toBe(false);
  });
});
