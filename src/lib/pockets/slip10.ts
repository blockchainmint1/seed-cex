/**
 * SLIP-0010 ed25519 derivation (Solana). Hardened-only by design — there is no
 * public-key derivation, which is why Solana pockets can't be shared as an xpub.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";

const enc = new TextEncoder();

export function slip10Ed25519(seed: Uint8Array, path: string): { privateKey: Uint8Array; chainCode: Uint8Array; publicKey: Uint8Array } {
  const parts = path.split("/");
  if (parts[0] !== "m") throw new Error("Path must start with m");
  let I = hmac(sha512, enc.encode("ed25519 seed"), seed);
  let key = I.slice(0, 32);
  let chain = I.slice(32);
  for (const p of parts.slice(1)) {
    if (!p.endsWith("'")) throw new Error("ed25519 derivation is hardened-only");
    const n = Number(p.slice(0, -1));
    if (!Number.isInteger(n) || n < 0 || n >= 0x80000000) throw new Error("Bad path index");
    const data = new Uint8Array(37);
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, (n | 0x80000000) >>> 0, false);
    I = hmac(sha512, chain, data);
    key.fill(0);
    key = I.slice(0, 32);
    chain = I.slice(32);
  }
  return { privateKey: key, chainCode: chain, publicKey: ed25519.getPublicKey(key) };
}
