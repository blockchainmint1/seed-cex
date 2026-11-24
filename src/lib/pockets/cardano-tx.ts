/**
 * Cardano (ADA) plain transfers from a pocket's base address (pure, client-safe, tested).
 *
 * Builds a Conway-era transaction with ADA-only inputs, one payment output and an
 * optional change output back to the pocket, then signs it with the receive key's
 * BIP32-Ed25519 extended key (kL‖kR). Inputs carrying other tokens are never spent,
 * so tokens can't leave by accident.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { bech32, hex } from "@scure/base";

const N = ed25519.Point.Fn.ORDER;

// ---- minimal CBOR (definite lengths only) ----
type Cbor = bigint | number | string | Uint8Array | Cbor[] | Map<number | string, Cbor> | boolean | null;
function head(major: number, n: bigint): number[] {
  const m = major << 5;
  if (n < 24n) return [m | Number(n)];
  if (n < 0x100n) return [m | 24, Number(n)];
  if (n < 0x10000n) return [m | 25, Number(n >> 8n), Number(n & 0xffn)];
  if (n < 0x100000000n) return [m | 26, ...[24n, 16n, 8n, 0n].map((s) => Number((n >> s) & 0xffn))];
  return [m | 27, ...[56n, 48n, 40n, 32n, 24n, 16n, 8n, 0n].map((s) => Number((n >> s) & 0xffn))];
}
export function cbor(v: Cbor): Uint8Array {
  const out: number[] = [];
  const enc = (x: Cbor) => {
    if (x === null) out.push(0xf6);
    else if (x === true) out.push(0xf5);
    else if (x === false) out.push(0xf4);
    else if (typeof x === "number" || typeof x === "bigint") {
      const b = BigInt(x);
      if (b < 0n) throw new Error("negative ints not used");
      out.push(...head(0, b));
    } else if (typeof x === "string") { const b = new TextEncoder().encode(x); out.push(...head(3, BigInt(b.length))); out.push(...b); }
    else if (x instanceof Uint8Array) { out.push(...head(2, BigInt(x.length))); out.push(...x); }
    else if (Array.isArray(x)) { out.push(...head(4, BigInt(x.length))); x.forEach(enc); }
    else { out.push(...head(5, BigInt(x.size))); for (const [k, val] of x) { enc(k); enc(val); } }
  };
  enc(v);
  return Uint8Array.from(out);
}

/** Raw bytes of a Shelley (addr1…) address; Byron and testnet addresses are refused. */
export function cardanoAddressBytes(address: string): Uint8Array {
  const d = bech32.decode(address.toLowerCase() as `${string}1${string}`, 200);
  if (d.prefix !== "addr") throw new Error("Only mainnet addr1… addresses are supported");
  const b = Uint8Array.from(bech32.fromWords(d.words));
  if ((b[0]! & 0x0f) !== 1) throw new Error("Not a mainnet address");
  if (b.length !== 57 && b.length !== 29) throw new Error("Unsupported Cardano address type");
  return b;
}

// ---- BIP32-Ed25519 signing with an extended key ----
function leToBig(b: Uint8Array): bigint {
  let n = 0n;
  for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]!);
  return n;
}
function bigToLe(n: bigint, len: number): Uint8Array {
  const o = new Uint8Array(len);
  for (let i = 0; i < len; i++) { o[i] = Number(n & 0xffn); n >>= 8n; }
  return o;
}
export function extendedPublicKey(ext: Uint8Array): Uint8Array {
  return ed25519.Point.BASE.multiply(leToBig(ext.slice(0, 32)) % N).toBytes();
}
/** Ed25519 signature from an extended secret (kL scalar, kR nonce prefix). Verifies with plain ed25519. */
export function signExtended(ext: Uint8Array, msg: Uint8Array): Uint8Array {
  if (ext.length < 64) throw new Error("Cardano signing key must be 64 bytes");
  const kL = leToBig(ext.slice(0, 32)) % N;
  const A = ed25519.Point.BASE.multiply(kL).toBytes();
  const r = leToBig(sha512(Uint8Array.from([...ext.slice(32, 64), ...msg]))) % N;
  const R = ed25519.Point.BASE.multiply(r === 0n ? N : r).toBytes();
  const k = leToBig(sha512(Uint8Array.from([...R, ...A, ...msg]))) % N;
  const S = (r + k * kL) % N;
  return Uint8Array.from([...R, ...bigToLe(S, 32)]);
}

export type AdaUtxo = { txHash: string; index: number; lovelace: bigint; hasTokens: boolean };
export type AdaParams = { minFeeA: bigint; minFeeB: bigint; coinsPerUtxoByte: bigint };

/** Seeds never pays more than this per Cardano send (normal is ~0.17 ADA). */
export const ADA_MAX_FEE = 1_000_000n;

/** Smallest ADA-only output the network accepts (Babbage rule: (160 + size) × coinsPerUtxoByte, with headroom). */
export function minAdaOutput(p: AdaParams, addrLen = 57): bigint {
  return (160n + BigInt(addrLen) + 20n) * p.coinsPerUtxoByte;
}

/** Leftover this small (0.2 ADA) is added to the fee instead of refusing a send-everything withdrawal. */
export const ADA_DUST_TO_FEE = 200_000n;

export type AdaPlan = { inputs: AdaUtxo[]; fee: bigint; change: bigint };

/**
 * CIP-20 message metadata (label 674, {msg: [chunks]}) — the form Maya reads a swap memo
 * from (checked against live Maya ADA inbounds, Nov 24 2026). Chunks are ≤64 bytes; memos are ASCII.
 */
export function memoAuxData(memo: string): Map<number | string, Cbor> {
  if (!/^[\x20-\x7e]+$/.test(memo) || memo.length > 250) throw new Error("Swap memo must be plain text up to 250 characters.");
  const chunks: string[] = [];
  for (let i = 0; i < memo.length; i += 64) chunks.push(memo.slice(i, i + 64));
  return new Map<number | string, Cbor>([[674, new Map<number | string, Cbor>([["msg", chunks]])]]);
}

function body(inputs: AdaUtxo[], to: Uint8Array, amount: bigint, change: bigint, from: Uint8Array, fee: bigint, ttl: number, auxHash?: Uint8Array) {
  const outs: Cbor[] = [[to, amount]];
  if (change > 0n) outs.push([from, change]);
  const m = new Map<number | string, Cbor>([
    [0, inputs.map((u) => [hex.decode(u.txHash), u.index])],
    [1, outs],
    [2, fee],
    [3, ttl],
  ]);
  if (auxHash) m.set(7, auxHash);
  return m;
}
const FAKE_WITNESS = new Map<number | string, Cbor>([[0, [[new Uint8Array(32), new Uint8Array(64)]]]]);

export type AdaTransfer = {
  signingKey: Uint8Array; fromAddress: string; toAddress: string; lovelace: bigint;
  utxos: AdaUtxo[]; params: AdaParams; ttl: number;
  /** Optional swap memo, carried as CIP-20 metadata. */
  memo?: string;
};

/**
 * Pick inputs, size the fee exactly and sign. Throws (nothing signed) when the pocket
 * can't cover amount + fee while leaving either nothing or a valid change output.
 */
export function buildCardanoTransfer(t: AdaTransfer): { txid: string; cborHex: string; fee: bigint; change: bigint } {
  const to = cardanoAddressBytes(t.toAddress), from = cardanoAddressBytes(t.fromAddress);
  const minOut = minAdaOutput(t.params, to.length);
  if (t.lovelace < minOut) throw new Error(`Cardano needs at least ${Number(minOut) / 1e6} ADA in one send.`);
  const usable = t.utxos.filter((u) => !u.hasTokens).sort((a, b) => (b.lovelace > a.lovelace ? 1 : b.lovelace < a.lovelace ? -1 : 0));
  const minChange = minAdaOutput(t.params, from.length);
  const aux = t.memo ? memoAuxData(t.memo) : null;
  const auxHash = aux ? blake2b(cbor(aux), { dkLen: 32 }) : undefined;
  const inputs: AdaUtxo[] = [];
  let total = 0n;
  for (const u of usable) {
    inputs.push(u); total += u.lovelace;
    let fee = 0n, change = 0n, ok = false;
    for (let i = 0; i < 4; i++) {
      change = total - t.lovelace - fee;
      const hasChange = change >= minChange;
      const size = BigInt(cbor([body(inputs, to, t.lovelace, hasChange ? change : 0n, from, fee || 200_000n, t.ttl, auxHash), FAKE_WITNESS, true, aux]).length);
      const need = t.params.minFeeA * size + t.params.minFeeB + 200n;
      if (need === fee) { ok = true; break; }
      fee = need;
    }
    change = total - t.lovelace - fee;
    if (change < 0n) continue;
    if (change > 0n && change < minChange) {
      // A crumb too small for its own output joins the fee (send-everything case); else try one more input.
      if (change <= ADA_DUST_TO_FEE) { fee += change; change = 0n; } else continue;
    }
    if (!ok && change > 0n) continue;
    if (fee > ADA_MAX_FEE) throw new Error("Cardano network fee would be unusually high. Nothing was sent.");
    const b = body(inputs, to, t.lovelace, change, from, fee, t.ttl, auxHash);
    const bodyBytes = cbor(b);
    const hash = blake2b(bodyBytes, { dkLen: 32 });
    const sig = signExtended(t.signingKey, hash);
    const vkey = extendedPublicKey(t.signingKey);
    const tx = cbor([b, new Map<number | string, Cbor>([[0, [[vkey, sig]]]]), true, aux]);
    return { txid: hex.encode(hash), cborHex: hex.encode(tx), fee, change };
  }
  throw new Error(`Not enough ADA: keep about ${Number(minChange) / 1e6 + 0.2} ADA behind for the fee and Cardano's minimum, or send everything except the fee. Nothing was sent.`);
}
