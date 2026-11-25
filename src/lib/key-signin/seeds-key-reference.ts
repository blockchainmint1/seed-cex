/**
 * Reference implementation of the Seeds Key page's side of the hand-off.
 * Not used by the Seeds app itself: the separate Seeds Key project copies this
 * file (plus src/lib/pockets/) so both sides run the exact same code, and the
 * tests here prove Seeds' server accepts what it produces.
 *
 * Runs in a browser (WebCrypto). The recovery phrase stays inside these
 * functions and is never sent anywhere.
 */
import { x25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { base64, base64urlnopad, createBase58check, hex } from "@scure/base";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { normalizeMnemonic, pocketsFromMnemonic } from "../pockets/derive";
import { keySigninMessage, pairingCode, type KeyKind } from "./rules";

const enc = new TextEncoder();
const b58c = createBase58check(sha256);

export type KeyManifest = {
  type: "seeds-key-signin"; version: 1; domain: string; challenge_id: string; challenge: string;
  recipient_pubkey: string; submit_url: string; expires_at: string; pocket: number;
  /** Seeds Key host and request time: wallet sign-ins sign them (Sign-In with Ethereum / Solana layout). */
  key_host: string | null; issued_at: string;
  origin?: string; pairing_code?: string;
};

/** The only place a Seeds Key page may take a sign-in request from. Testing against a Seeds
 *  preview address needs the tester's own local setting — it is never on this list. */
export const SEEDS_ORIGINS = ["https://seeds.honest.money"] as const;

/**
 * Auditor HK2: the look-alike-site check, in code. Returns a reason to refuse, or null. The page
 * must call it before showing anything; buildHandoff calls it again and refuses on any problem.
 */
export function manifestProblem(manifestUrl: string, m: KeyManifest, now: Date = new Date()): string | null {
  let url: URL, submit: URL;
  try { url = new URL(manifestUrl); submit = new URL(m.submit_url); } catch { return "bad_url"; }
  if (!(SEEDS_ORIGINS as readonly string[]).includes(url.origin)) return "origin_not_allowed";
  if (url.protocol !== "https:") return "not_https";
  if (submit.origin !== url.origin) return "submit_origin";
  if (m.origin !== undefined && m.origin !== url.origin) return "origin_mismatch";
  if (m.domain !== url.host) return "domain_mismatch";
  if (m.type !== "seeds-key-signin" || m.version !== 1) return "bad_type";
  if (m.pocket !== 1106) return "bad_pocket";
  if (m.pairing_code !== undefined && m.pairing_code !== pairingCode(m.challenge)) return "pairing_mismatch";
  const exp = Date.parse(m.expires_at);
  if (!Number.isFinite(exp) || exp <= now.getTime()) return "expired";
  return null;
}
export { pairingCode };

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
function varint(n: number): Uint8Array {
  if (n < 0xfd) return Uint8Array.of(n);
  return Uint8Array.of(0xfd, n & 0xff, n >> 8);
}

/** Seal bytes to Seeds' one-time key: eph(32) ‖ nonce(12) ‖ AES-256-GCM(ct ‖ tag) — the hm-link-delegate v1 format. */
export async function sealTo(recipientPubB64url: string, plain: Uint8Array): Promise<Uint8Array> {
  const recipient = base64urlnopad.decode(recipientPubB64url.replace(/=+$/, ""));
  const ephPriv = x25519.utils.randomSecretKey();
  const eph = x25519.getPublicKey(ephPriv);
  const shared = x25519.getSharedSecret(ephPriv, recipient);
  const key = hkdf(sha256, shared, concat(eph, recipient), enc.encode("hm-link-delegate v1"), 32);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const k = await crypto.subtle.importKey("raw", Uint8Array.from(key), "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, k, Uint8Array.from(plain)));
  ephPriv.fill(0); key.fill(0); shared.fill(0);
  return concat(eph, nonce, ct);
}

/** TEXITcoin message signature (Bitcoin-style, compressed key) and its P2PKH address. */
export function signTxcMessage(privateKey: Uint8Array, message: string): { address: string; signature: string } {
  const pub = secp256k1.getPublicKey(privateKey, true);
  const address = b58c.encode(concat(Uint8Array.of(66), ripemd160(sha256(pub))));
  const p = enc.encode("Bitcoin Signed Message:\n");
  const m = enc.encode(message);
  const h = sha256(sha256(concat(varint(p.length), p, varint(m.length), m)));
  const sig = secp256k1.sign(h, privateKey, { prehash: false, format: "recovered" });
  // noble "recovered" = recovery(1) ‖ r ‖ s → Bitcoin header 31 + recovery (compressed).
  const out = concat(Uint8Array.of(31 + sig[0]!), sig.slice(1));
  return { address, signature: base64.encode(out) };
}

/**
 * Optional BIP39 extra password ("25th word"). "" = none, so coin and wallet flows are unchanged.
 * NFKD-normalised once here, so the BIP39 seed (which normalises anyway) and Cardano's Icarus
 * key get the same bytes. Any other password is a different wallet with a different identity.
 */
export function seedPassphrase(passphrase: unknown = ""): string {
  if (typeof passphrase !== "string") throw new Error("That extra password isn't valid");
  return passphrase.normalize("NFKD");
}

/** The coin's sign-in identity: TXC m/44'/696969'/0'/0/0 (the same address HME Wallet signs links with). */
export function coinIdentityKey(words: string, passphrase = ""): Uint8Array {
  const phrase = normalizeMnemonic(words);
  if (!validateMnemonic(phrase, wordlist)) throw new Error("That recovery phrase isn't valid");
  const seed = mnemonicToSeedSync(phrase, seedPassphrase(passphrase));
  const root = HDKey.fromMasterSeed(seed);
  try {
    const node = root.derive("m/44'/696969'/0'/0/0");
    return Uint8Array.from(node.privateKey!);
  } finally {
    root.wipePrivateData(); seed.fill(0);
  }
}

/**
 * Outside wallets: their signature over walletPocketMessage(host, kind, address) becomes a
 * 24-word phrase on the device, and the pocket comes from that phrase.
 * Same wallet + same message → same signature (RFC 6979 / ed25519) → same pocket.
 * v2 = the Sign-In with Ethereum/Solana message layout (v1 was never used by members).
 */
export function walletPocketWords(signature: Uint8Array, keyHost: string): string {
  const entropy = hkdf(sha256, signature, enc.encode("seeds-key wallet pocket v2"), enc.encode(keyHost), 32);
  try { return entropyToMnemonic(entropy, wordlist); } finally { entropy.fill(0); }
}

/** Everything the submit endpoint needs except the signature (the caller signs `message` with the identity key). */
export async function buildHandoff(p: { manifestUrl: string; manifest: KeyManifest; words: string; kind: KeyKind; identity: string; account?: number; passphrase?: string }) {
  const problem = manifestProblem(p.manifestUrl, p.manifest);
  if (problem) throw new Error(`Refusing to hand over keys: ${problem}`);
  const account = p.account ?? p.manifest.pocket;
  // Same extra password as coinIdentityKey, or the pocket and the identity come from different wallets.
  const bundle = pocketsFromMnemonic(p.words, { account, passphrase: seedPassphrase(p.passphrase ?? "") });
  const sealed = await sealTo(p.manifest.recipient_pubkey, enc.encode(JSON.stringify(bundle.xprvs)));
  for (const k of Object.keys(bundle.xprvs)) (bundle.xprvs as Record<string, string>)[k] = "";
  const payloadSha = hex.encode(sha256(sealed));
  const message = keySigninMessage({
    domain: p.manifest.domain, challenge: p.manifest.challenge, kind: p.kind, identity: p.identity, account, paths: bundle.paths, payloadSha,
    keyHost: p.manifest.key_host ?? undefined, issuedAt: p.manifest.issued_at, expiresAt: p.manifest.expires_at,
  });
  return {
    message,
    body: { token: p.manifest.challenge_id, kind: p.kind, identity_address: p.identity, account, paths: bundle.paths, xpubs: bundle.xpubs, payload: base64urlnopad.encode(sealed) },
    addresses: bundle.addresses,
  };
}
