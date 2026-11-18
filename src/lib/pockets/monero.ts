/**
 * Monero pocket keys — Trezor's method (SLIP-0010 ed25519). Pure, client-safe.
 *
 * The same 12 words make a DIFFERENT Monero wallet in Ledger (BIP32 secp256k1,
 * then converted). Seeds uses Trezor's method because that is what HME Wallet
 * derives, so coins always land in a wallet Seeds and the member can both see.
 *
 *   key seed  = SLIP-0010 ed25519 private key at m/44'/128'/N'
 *   spend sec = key seed mod l                       (Trezor: decodeint)
 *   view sec  = keccak256(spend sec) mod l           (Monero standard)
 *   address   = Monero base58( 0x12 ‖ spendPub ‖ viewPub ‖ keccak[0..4] )
 *
 * Reducing is idempotent, so a wallet may send either the raw SLIP-0010 key
 * or the already-reduced spend key — both give the same wallet. The spend
 * key is the standard Monero private spend key: any Monero wallet can restore
 * from it ("restore from keys" / --generate-from-spend-key).
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { base58xmr, hex } from "@scure/base";

const L = ed25519.Point.Fn.ORDER;
const MAINNET_STANDARD = 0x12;

function leToBig(b: Uint8Array): bigint {
  let n = 0n;
  for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]!);
  return n;
}
function bigToLe(n: bigint, len = 32): Uint8Array {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) { out[i] = Number(n & 0xffn); n >>= 8n; }
  return out;
}

export function scReduce(b: Uint8Array): Uint8Array {
  return bigToLe(leToBig(b) % L);
}

function pubOf(sec: Uint8Array): Uint8Array {
  const s = leToBig(sec);
  if (s === 0n) throw new Error("Bad Monero key");
  return ed25519.Point.BASE.multiply(s).toBytes();
}

export type MoneroKeys = { spendSec: Uint8Array; viewSec: Uint8Array; spendPub: Uint8Array; viewPub: Uint8Array };

/** From the 32-byte SLIP-0010 key seed (or the spend key itself). Caller wipes spendSec/viewSec. */
export function moneroKeysFromSeedKey(key32: Uint8Array): MoneroKeys {
  if (key32.length !== 32) throw new Error("Monero keys are 32 bytes");
  const spendSec = scReduce(key32);
  const viewSec = scReduce(keccak_256(spendSec));
  return { spendSec, viewSec, spendPub: pubOf(spendSec), viewPub: pubOf(viewSec) };
}

export function moneroAddress(spendPub: Uint8Array, viewPub: Uint8Array): string {
  const body = new Uint8Array(65);
  body[0] = MAINNET_STANDARD;
  body.set(spendPub, 1);
  body.set(viewPub, 33);
  const out = new Uint8Array(69);
  out.set(body);
  out.set(keccak_256(body).slice(0, 4), 65);
  return base58xmr.encode(out);
}

/** Primary (standard, mainnet) address → its two public keys; checksum verified. */
export function parseMoneroAddress(address: string): { spendPub: Uint8Array; viewPub: Uint8Array } {
  const raw = base58xmr.decode(address);
  if (raw.length !== 69 || raw[0] !== MAINNET_STANDARD) throw new Error("Not a Monero primary address");
  const sum = keccak_256(raw.slice(0, 65)).slice(0, 4);
  if (sum.some((v, i) => v !== raw[65 + i])) throw new Error("Bad Monero address checksum");
  return { spendPub: raw.slice(1, 33), viewPub: raw.slice(33, 65) };
}

/**
 * The public half a wallet submits: the primary address (preferred), or
 * hex(spendPub ‖ viewPub). Returns the primary address either way.
 */
export function moneroPublicToAddress(pub: string): string {
  if (/^[0-9a-f]{128}$/i.test(pub)) {
    const b = hex.decode(pub.toLowerCase());
    const addr = moneroAddress(b.slice(0, 32), b.slice(32));
    parseMoneroAddress(addr);
    return addr;
  }
  parseMoneroAddress(pub);
  return pub;
}

/** The private half (hex 32 bytes) must give exactly the submitted address. */
export function moneroKeysMatch(privHex: string, pub: string): boolean {
  try {
    if (!/^[0-9a-f]{64}$/i.test(privHex)) return false;
    const seedKey = hex.decode(privHex.toLowerCase());
    const k = moneroKeysFromSeedKey(seedKey);
    const ok = moneroAddress(k.spendPub, k.viewPub) === moneroPublicToAddress(pub);
    seedKey.fill(0); k.spendSec.fill(0); k.viewSec.fill(0);
    return ok;
  } catch {
    return false;
  }
}
