/**
 * Seeds Key sign-in — server side. The Seeds Key page (a separate site) turns
 * a coin's recovery phrase, or an outside wallet's signature, into:
 *   - a signature over keySigninMessage (proves who is signing in), and
 *   - the keys to one trading pocket, sealed to a one-time X25519 key
 *     (exactly the hm-link-delegate "access" payload HME Wallet sends).
 * Seeds never receives the phrase. See docs/seeds-key-page.md.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base58, base64, hex } from "@scure/base";
import { verifyTxcMessage } from "../hme-link.server";
import { recoverPersonalSignAddress } from "../wallet-auth.server";
import type { KeyKind } from "./rules";

const enc = new TextEncoder();

export function sha256Hex(s: string): string {
  return hex.encode(sha256(enc.encode(s)));
}

/** Constant-time compare of two hex digests. */
export function sameDigest(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function solSigBytes(sig: string): Uint8Array | null {
  const s = sig.trim();
  try {
    if (/^(0x)?[0-9a-fA-F]{128}$/.test(s)) return hex.decode(s.replace(/^0x/, "").toLowerCase());
    if (/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(s)) return base58.decode(s);
    const t = s.replace(/-/g, "+").replace(/_/g, "/");
    return base64.decode(t + "=".repeat((4 - (t.length % 4)) % 4));
  } catch {
    return null;
  }
}

/** Does `signature` over `message` come from `identity` for this kind? */
export function verifyKeySignature(kind: KeyKind, identity: string, message: string, signature: string): boolean {
  if (typeof signature !== "string" || signature.length > 400) return false;
  if (kind === "coin") return verifyTxcMessage(identity, message, signature);
  if (kind === "evm") {
    if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return false;
    const who = recoverPersonalSignAddress(message, signature);
    return Boolean(who && who.toLowerCase() === identity.toLowerCase());
  }
  try {
    const sig = solSigBytes(signature);
    const pub = base58.decode(identity);
    if (!sig || sig.length !== 64 || pub.length !== 32) return false;
    return ed25519.verify(sig, enc.encode(message), pub);
  } catch {
    return false;
  }
}

/** Hashed connection address for counting sign-ups per network (the address itself is never stored). */
export function ipHash(ip: string): string {
  return sha256Hex(`seeds-key-ip|${ip}`).slice(0, 32);
}

export function corsJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      // The Seeds Key page is a different site. These endpoints carry no cookies and
      // trust only signatures, so any origin may call them.
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "600",
    },
  });
}

export function corsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "600",
    },
  });
}
