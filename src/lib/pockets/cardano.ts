/**
 * Cardano pocket keys — CIP-1852 with the Icarus master key (CIP-3), the
 * method Yoroi, Eternl, Lace and Trezor use for 12/15/24 words. Pure, client-safe.
 *
 *   account   = m/1852'/1815'/N'   (BIP32-Ed25519, hardened)
 *   public    = hex( A 32 ‖ chain code 32 )            (what HME Wallet sends)
 *   private   = hex( kL 32 ‖ kR 32 ‖ chain code 32 )   (secret)
 *   address   = Shelley base address, payment key account/0/0 + stake key account/2/0
 *
 * Unlike the other ed25519 coins, BIP32-Ed25519 allows public (soft)
 * derivation, so Seeds can make receive addresses from the public half alone.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { bech32, hex } from "@scure/base";

const H = 0x80000000;
const N = ed25519.Point.Fn.ORDER;
const MOD256 = 1n << 256n;

function leToBig(b: Uint8Array): bigint {
  let n = 0n;
  for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]!);
  return n;
}
function bigToLe(n: bigint, len: number): Uint8Array {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) { out[i] = Number(n & 0xffn); n >>= 8n; }
  return out;
}
function le32(i: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, i >>> 0, true);
  return b;
}
function cat(...p: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(p.reduce((s, x) => s + x.length, 0));
  let o = 0;
  for (const x of p) { out.set(x, o); o += x.length; }
  return out;
}

function pointOf(kL: Uint8Array): Uint8Array {
  return ed25519.Point.BASE.multiply(leToBig(kL) % N).toBytes();
}

/** CIP-3 Icarus master key from BIP39 entropy: PBKDF2-HMAC-SHA512(passphrase, entropy, 4096, 96) + clamp. */
export function icarusMaster(entropy: Uint8Array, passphrase = ""): Uint8Array {
  const k = pbkdf2(sha512, new TextEncoder().encode(passphrase), entropy, { c: 4096, dkLen: 96 });
  k[0]! &= 0b11111000;
  k[31]! &= 0b00011111;
  k[31]! |= 0b01000000;
  return k;
}

/** Hardened private child (V2). xprv = kL‖kR‖cc. */
export function hardenedChild(xprv: Uint8Array, index: number): Uint8Array {
  const kL = xprv.slice(0, 32), kR = xprv.slice(32, 64), cc = xprv.slice(64, 96);
  const idx = le32((index + H) >>> 0);
  const Z = hmac(sha512, cc, cat(Uint8Array.of(0x00), kL, kR, idx));
  const I = hmac(sha512, cc, cat(Uint8Array.of(0x01), kL, kR, idx));
  const nkL = bigToLe((leToBig(Z.slice(0, 28)) * 8n + leToBig(kL)) % MOD256, 32);
  const nkR = bigToLe((leToBig(Z.slice(32, 64)) + leToBig(kR)) % MOD256, 32);
  Z.fill(0); kL.fill(0); kR.fill(0);
  return cat(nkL, nkR, I.slice(32, 64));
}

/** Account private key m/1852'/1815'/account' from entropy. Caller wipes. */
export function cardanoAccountXprv(entropy: Uint8Array, account: number, passphrase = ""): Uint8Array {
  let k = icarusMaster(entropy, passphrase);
  for (const seg of [1852, 1815, account]) {
    const next = hardenedChild(k, seg);
    k.fill(0);
    k = next;
  }
  return k;
}

/** Public half (A‖cc) of an extended private key. */
export function xprvToXpub(xprv: Uint8Array): Uint8Array {
  return cat(pointOf(xprv.slice(0, 32)), xprv.slice(64, 96));
}

/** Soft (public) child: A_i = A + 8·ZL·G. xpub = A‖cc. */
export function softPublicChild(xpub: Uint8Array, index: number): Uint8Array {
  if (index >= H) throw new Error("Public derivation is soft-only");
  const A = xpub.slice(0, 32), cc = xpub.slice(32, 64);
  const idx = le32(index);
  const Z = hmac(sha512, cc, cat(Uint8Array.of(0x02), A, idx));
  const I = hmac(sha512, cc, cat(Uint8Array.of(0x03), A, idx));
  const zl8 = (leToBig(Z.slice(0, 28)) * 8n) % N;
  const child = ed25519.Point.fromBytes(A).add(ed25519.Point.BASE.multiply(zl8 === 0n ? N : zl8));
  return cat(child.toBytes(), I.slice(32, 64));
}

/** Soft private child — needed to sign from the receive key. */
export function softPrivateChild(xprv: Uint8Array, index: number): Uint8Array {
  const kL = xprv.slice(0, 32), kR = xprv.slice(32, 64), cc = xprv.slice(64, 96);
  const A = pointOf(kL);
  const idx = le32(index);
  const Z = hmac(sha512, cc, cat(Uint8Array.of(0x02), A, idx));
  const I = hmac(sha512, cc, cat(Uint8Array.of(0x03), A, idx));
  const nkL = bigToLe((leToBig(Z.slice(0, 28)) * 8n + leToBig(kL)) % MOD256, 32);
  const nkR = bigToLe((leToBig(Z.slice(32, 64)) + leToBig(kR)) % MOD256, 32);
  Z.fill(0); kL.fill(0); kR.fill(0);
  return cat(nkL, nkR, I.slice(32, 64));
}

const keyHash = (pub32: Uint8Array) => blake2b(pub32, { dkLen: 28 });

/** Mainnet base address (header 0x01): payment key account/0/0, stake key account/2/0. */
export function cardanoBaseAddress(accountXpub: Uint8Array, network: "mainnet" | "testnet" = "mainnet"): string {
  if (accountXpub.length !== 64) throw new Error("Cardano account keys are 64 bytes");
  const pay = softPublicChild(softPublicChild(accountXpub, 0), 0).slice(0, 32);
  const stake = softPublicChild(softPublicChild(accountXpub, 2), 0).slice(0, 32);
  const header = network === "mainnet" ? 0x01 : 0x00;
  const bytes = cat(Uint8Array.of(header), keyHash(pay), keyHash(stake));
  return bech32.encode(network === "mainnet" ? "addr" : "addr_test", bech32.toWords(bytes), 200);
}

export function parseCardanoXpub(pub: string): Uint8Array {
  if (!/^[0-9a-f]{128}$/i.test(pub)) throw new Error("Cardano public key must be 64 bytes of hex");
  const b = hex.decode(pub.toLowerCase());
  ed25519.Point.fromBytes(b.slice(0, 32)); // must be a curve point
  return b;
}

/** The private half (kL‖kR‖cc) must give exactly the submitted public half. */
export function cardanoKeysMatch(privHex: string, pubHex: string): boolean {
  try {
    if (!/^[0-9a-f]{192}$/i.test(privHex)) return false;
    const k = hex.decode(privHex.toLowerCase());
    const ok = hex.encode(xprvToXpub(k)) === hex.encode(parseCardanoXpub(pubHex));
    k.fill(0);
    return ok;
  } catch {
    return false;
  }
}
