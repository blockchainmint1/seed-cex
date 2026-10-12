/**
 * HME Wallet trading link (`hm-link-delegate`) — Seeds side.
 * Spec: HME Wallet reply doc. Two modes:
 *   access  → sealed account xprvs (X25519 + HKDF-SHA256 + AES-256-GCM)
 *   approve → xpubs only; Seeds proposes PSBTs the user approves in-wallet.
 */
import { x25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { base64, base64urlnopad, createBase58check, hex } from "@scure/base";
import { HDKey } from "@scure/bip32";
import { createDecipheriv } from "node:crypto";

export const LINK_DOMAIN = "seeds.honest.money";
export const ALLOWED_CHAINS = ["TXC", "ISK", "BTC", "LTC", "EVM"] as const;
export type LinkChain = (typeof ALLOWED_CHAINS)[number];

/** Path templates; the wallet may substitute 1106..2105 after pocket rotation. */
const PATH_RE: Record<LinkChain, RegExp> = {
  TXC: /^m\/44'\/696969'\/(\d+)'$/,
  ISK: /^m\/44'\/969696'\/(\d+)'$/,
  BTC: /^m\/84'\/0'\/(\d+)'$/,
  LTC: /^m\/44'\/2'\/(\d+)'$/,
  EVM: /^m\/44'\/60'\/(\d+)'$/,
};
export const REQUEST_PATHS: Record<LinkChain, string> = {
  TXC: "m/44'/696969'/1106'",
  ISK: "m/44'/969696'/1106'",
  BTC: "m/84'/0'/1106'",
  LTC: "m/44'/2'/1106'",
  EVM: "m/44'/60'/1106'",
};

export function chainForPath(path: string): { chain: LinkChain; account: number } | null {
  for (const c of ALLOWED_CHAINS) {
    const m = PATH_RE[c].exec(path);
    if (m) return { chain: c, account: Number(m[1]) };
  }
  return null;
}

export function validAccount(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 1106 && (n as number) <= 2105;
}

// ---------- message templates ----------
export function delegateMessage(p: {
  domain: string; challenge: string; mode: "access" | "approve"; paths: string[]; payloadSha: string;
}): string {
  const last = p.mode === "access"
    ? "I authorize this site to spend from these branches until I revoke."
    : "I authorize this site to propose trades from these branches. Each trade needs my approval.";
  return `Honest Money - Link wallet (delegate)\n\nDomain: ${p.domain}\nChallenge: ${p.challenge}\nMode: ${p.mode}\nPaths: ${p.paths.join(",")}\nPayload-SHA256: ${p.payloadSha}\n\n${last}`;
}
export function revokeMessagePrefix(domain: string, linkId: string): string {
  return `Honest Money - Revoke link\n\nDomain: ${domain}\nLink: ${linkId}\nIssued At: `;
}
export function tradeMessage(p: { domain: string; decision: "approve" | "decline"; linkId: string; tradeId: string; psbtSha: string }): string {
  const head = p.decision === "approve" ? "Honest Money - Approve trade" : "Honest Money - Decline trade";
  return `${head}\n\nDomain: ${p.domain}\nLink: ${p.linkId}\nTrade: ${p.tradeId}\nPSBT-SHA256: ${p.psbtSha}`;
}

// ---------- Bitcoin-style message signature against a TXC P2PKH address ----------
const b58c = createBase58check(sha256);
const TXC_P2PKH_VERSION = 66;
const enc = new TextEncoder();

function varint(n: number): Uint8Array {
  if (n < 0xfd) return Uint8Array.of(n);
  if (n <= 0xffff) return Uint8Array.of(0xfd, n & 0xff, n >> 8);
  return Uint8Array.of(0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff);
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
function magicHash(prefix: string, message: string): Uint8Array {
  const p = enc.encode(prefix);
  const m = enc.encode(message);
  return sha256(sha256(concat(varint(p.length), p, varint(m.length), m)));
}
function decodeB64(s: string): Uint8Array {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  return base64.decode(t + "=".repeat((4 - (t.length % 4)) % 4));
}

/** Accepts the Bitcoin and TEXITcoin message magics (wallets differ). */
export function verifyTxcMessage(address: string, message: string, signatureB64: string): boolean {
  let sig: Uint8Array;
  try { sig = decodeB64(signatureB64); } catch { return false; }
  if (sig.length !== 65) return false;
  const header = sig[0];
  if (header < 27 || header > 42) return false;
  const rec = (header - 27) & 3;
  const compressed = header >= 31;
  for (const prefix of ["Bitcoin Signed Message:\n", "TEXITcoin Signed Message:\n"]) {
    try {
      const h = magicHash(prefix, message);
      const s = secp256k1.Signature.fromBytes(sig.slice(1), "compact").addRecoveryBit(rec);
      const pub = s.recoverPublicKey(h).toBytes(compressed);
      const addr = b58c.encode(concat(Uint8Array.of(TXC_P2PKH_VERSION), ripemd160(sha256(pub))));
      if (addr === address) return true;
    } catch { /* try next */ }
  }
  return false;
}

// ---------- X25519 recipient keys + sealed payload ----------
export function newRecipientKeypair(): { priv: string; pub: string } {
  const priv = x25519.utils.randomSecretKey();
  return { priv: hex.encode(priv), pub: base64urlnopad.encode(x25519.getPublicKey(priv)) };
}

export function payloadSha256(payloadB64url: string): string {
  return hex.encode(sha256(decodeB64(payloadB64url)));
}

export function openSealed(payloadB64url: string, recipientPrivHex: string, recipientPubB64url: string): string {
  const raw = decodeB64(payloadB64url);
  if (raw.length < 32 + 12 + 16) throw new Error("payload too short");
  const eph = raw.slice(0, 32);
  const nonce = raw.slice(32, 44);
  const ct = raw.slice(44, raw.length - 16);
  const tag = raw.slice(raw.length - 16);
  const shared = x25519.getSharedSecret(hex.decode(recipientPrivHex), eph);
  const key = hkdf(sha256, shared, concat(eph, decodeB64(recipientPubB64url)), enc.encode("hm-link-delegate v1"), 32);
  const d = createDecipheriv("aes-256-gcm", Buffer.from(key), Buffer.from(nonce));
  d.setAuthTag(Buffer.from(tag));
  return Buffer.concat([d.update(Buffer.from(ct)), d.final()]).toString("utf8");
}

// ---------- extended keys ----------
const LTC_VERSIONS = { public: 0x019da462, private: 0x019d9cfe };

export function parseExtKey(chain: LinkChain, key: string): HDKey {
  if (chain === "LTC" && (key.startsWith("Ltub") || key.startsWith("Ltpv"))) return HDKey.fromExtendedKey(key, LTC_VERSIONS);
  return HDKey.fromExtendedKey(key);
}

/** Every xprv must neuter to the xpub the wallet sent. */
export function checkXprvMatches(chain: LinkChain, xprv: string, xpub: string): boolean {
  try {
    const k = parseExtKey(chain, xprv);
    const p = parseExtKey(chain, xpub);
    if (!k.privateKey || !k.publicKey || !p.publicKey) return false;
    return hex.encode(k.publicKey) === hex.encode(p.publicKey) && hex.encode(k.chainCode!) === hex.encode(p.chainCode!);
  } catch { return false; }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export function linkDomainFor(request: Request): string {
  const host = new URL(request.url).host;
  return host === LINK_DOMAIN || host.endsWith(".lovable.app") || host.startsWith("localhost") ? LINK_DOMAIN : host;
}
