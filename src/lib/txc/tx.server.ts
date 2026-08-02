/**
 * TEXITcoin (legacy P2PKH) transaction builder and signer.
 *
 * Server-only. Pure byte assembly — no node calls here, so it can be reasoned
 * about (and unit-checked) in isolation. TXC is a Bitcoin-Core-derived UTXO
 * chain, so this is classic pre-segwit serialization with SIGHASH_ALL.
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { base58check } from "@scure/base";

const b58check = base58check(sha256);

/** base58Prefixes[PUBKEY_ADDRESS] / [SCRIPT_ADDRESS] from TXC chainparams. */
export const TXC_P2PKH_VERSION = 66;
export const TXC_P2SH_VERSION = 5;

export const SATS = 100_000_000;
export const DUST_SATS = 546;
const SIGHASH_ALL = 1;

export type Utxo = {
  txid: string;
  vout: number;
  /** hex scriptPubKey of the output being spent */
  scriptPubKey: string;
  /** whole coins, as reported by scantxoutset */
  amount: number;
  height?: number;
};

function dsha256(b: Uint8Array): Uint8Array {
  return sha256(sha256(b));
}

function hash160(b: Uint8Array): Uint8Array {
  return ripemd160(sha256(b));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}

function u64le(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}

function varint(n: number): Uint8Array {
  if (n < 0xfd) return Uint8Array.of(n);
  if (n <= 0xffff) return concat(Uint8Array.of(0xfd), u32le(n).slice(0, 2));
  return concat(Uint8Array.of(0xfe), u32le(n));
}

function pushData(data: Uint8Array): Uint8Array {
  if (data.length < 0x4c) return concat(Uint8Array.of(data.length), data);
  return concat(Uint8Array.of(0x4c, data.length), data);
}

function reverseHex(txid: string): Uint8Array {
  return hexToBytes(txid).reverse();
}

/** 76 a9 14 <hash160> 88 ac */
export function p2pkhScript(hash: Uint8Array): Uint8Array {
  return concat(Uint8Array.of(0x76, 0xa9, 0x14), hash, Uint8Array.of(0x88, 0xac));
}

/** a9 14 <hash160> 87 */
export function p2shScript(hash: Uint8Array): Uint8Array {
  return concat(Uint8Array.of(0xa9, 0x14), hash, Uint8Array.of(0x87));
}

/** Decode a TXC base58 address into its output script. Throws on bad input. */
export function addressToScript(address: string): Uint8Array {
  let payload: Uint8Array;
  try {
    payload = b58check.decode(address);
  } catch {
    throw new Error(`Not a valid TEXITcoin address: ${address}`);
  }
  if (payload.length !== 21) throw new Error(`Unsupported address payload: ${address}`);
  const version = payload[0];
  const hash = payload.subarray(1);
  if (version === TXC_P2PKH_VERSION) return p2pkhScript(hash);
  if (version === TXC_P2SH_VERSION) return p2shScript(hash);
  throw new Error(`Address ${address} is not on the TEXITcoin mainnet`);
}

export function isValidTxcAddress(address: string): boolean {
  try {
    addressToScript(address);
    return true;
  } catch {
    return false;
  }
}

type TxOutput = { script: Uint8Array; value: bigint };

function serialize(
  inputs: Array<{ utxo: Utxo; script: Uint8Array }>,
  outputs: TxOutput[],
): Uint8Array {
  const parts: Uint8Array[] = [u32le(2), varint(inputs.length)];
  for (const inp of inputs) {
    parts.push(
      reverseHex(inp.utxo.txid),
      u32le(inp.utxo.vout),
      varint(inp.script.length),
      inp.script,
      u32le(0xffffffff),
    );
  }
  parts.push(varint(outputs.length));
  for (const out of outputs) {
    parts.push(u64le(out.value), varint(out.script.length), out.script);
  }
  parts.push(u32le(0));
  return concat(...parts);
}

/** Rough legacy P2PKH size: 148 B per input, 34 B per output, 10 B overhead. */
export function estimateVBytes(nIn: number, nOut: number): number {
  return nIn * 148 + nOut * 34 + 10;
}

export type BuiltTx = {
  hex: string;
  txid: string;
  feeSats: number;
  inputCount: number;
  changeSats: number;
  vbytes: number;
};

export type BuildParams = {
  privateKeyHex: string;
  fromAddress: string;
  toAddress: string;
  /** whole coins */
  amount: number;
  utxos: Utxo[];
  /** sat/vB */
  feeRate: number;
};

/**
 * Select coins, build, and sign a P2PKH spend.
 *
 * Coin selection is largest-first: fewest inputs, smallest fee, no privacy
 * pretensions. Change below the dust limit is donated to the fee rather than
 * creating an unspendable output.
 */
export function buildAndSignTransfer(params: BuildParams): BuiltTx {
  const priv = hexToBytes(params.privateKeyHex.toLowerCase());
  const pubkey = secp256k1.getPublicKey(priv, true);
  const ownerHash = hash160(pubkey);
  const ownScript = p2pkhScript(ownerHash);

  const expected = addressToScript(params.fromAddress);
  if (bytesToHex(expected) !== bytesToHex(ownScript)) {
    throw new Error("The authorized key does not control the funding address");
  }

  const toScript = addressToScript(params.toAddress);
  const target = BigInt(Math.round(params.amount * SATS));
  if (target < BigInt(DUST_SATS)) throw new Error("Amount is below the dust limit");

  const spendable = [...params.utxos]
    .filter((u) => u.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const feeRate = Math.max(1, Math.round(params.feeRate));
  const chosen: Utxo[] = [];
  let total = 0n;
  let fee = 0n;

  for (const u of spendable) {
    chosen.push(u);
    total += BigInt(Math.round(u.amount * SATS));
    fee = BigInt(estimateVBytes(chosen.length, 2) * feeRate);
    if (total >= target + fee) break;
  }

  if (total < target + fee) {
    throw new Error(
      `Insufficient balance on the authorized branch: need ${(Number(target + fee) / SATS).toFixed(8)} TXC, have ${(Number(total) / SATS).toFixed(8)} TXC`,
    );
  }

  let change = total - target - fee;
  const outputs: TxOutput[] = [{ script: toScript, value: target }];
  if (change >= BigInt(DUST_SATS)) {
    outputs.push({ script: ownScript, value: change });
  } else {
    fee += change;
    change = 0n;
    // one output only — recompute the fee floor so we never underpay
    const minFee = BigInt(estimateVBytes(chosen.length, 1) * feeRate);
    if (fee < minFee) throw new Error("Insufficient balance to cover the network fee");
  }

  // Sign every input with SIGHASH_ALL over the tx with only that input scripted.
  const scripts: Uint8Array[] = chosen.map(() => new Uint8Array(0));
  const signed: Uint8Array[] = [];

  for (let i = 0; i < chosen.length; i++) {
    const prevScript = hexToBytes(chosen[i].scriptPubKey);
    const preimageInputs = chosen.map((utxo, j) => ({
      utxo,
      script: j === i ? prevScript : new Uint8Array(0),
    }));
    const preimage = concat(serialize(preimageInputs, outputs), u32le(SIGHASH_ALL));
    const sig = secp256k1.sign(dsha256(preimage), priv, { format: "der", prehash: false });
    const scriptSig = concat(pushData(concat(sig, Uint8Array.of(SIGHASH_ALL))), pushData(pubkey));
    signed.push(scriptSig);
    scripts[i] = scriptSig;
  }

  const finalInputs = chosen.map((utxo, i) => ({ utxo, script: scripts[i] }));
  const raw = serialize(finalInputs, outputs);

  return {
    hex: bytesToHex(raw),
    txid: bytesToHex(dsha256(raw).reverse()),
    feeSats: Number(fee),
    inputCount: chosen.length,
    changeSats: Number(change),
    vbytes: raw.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Raw transaction parsing + signing                                          */
/*                                                                            */
/* Omni transactions are assembled by the node (payload → OP_RETURN →         */
/* reference → change), which hands back an *unsigned* raw tx. We sign it      */
/* here so private keys never leave this worker.                              */
/* -------------------------------------------------------------------------- */

type ParsedTx = {
  version: number;
  inputs: Array<{ txid: string; vout: number; sequence: number }>;
  outputs: TxOutput[];
  locktime: number;
};

function readVarint(b: Uint8Array, o: number): [number, number] {
  const first = b[o];
  if (first < 0xfd) return [first, o + 1];
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (first === 0xfd) return [dv.getUint16(o + 1, true), o + 3];
  if (first === 0xfe) return [dv.getUint32(o + 1, true), o + 5];
  return [Number(dv.getBigUint64(o + 1, true)), o + 9];
}

/** Parse a legacy (non-segwit) transaction. Throws on anything else. */
export function parseRawTx(hex: string): ParsedTx {
  const b = hexToBytes(hex.toLowerCase());
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 0;
  const version = dv.getUint32(o, true);
  o += 4;
  if (b[o] === 0x00) throw new Error("Segwit transactions are not supported here");

  let nIn: number;
  [nIn, o] = readVarint(b, o);
  const inputs: ParsedTx["inputs"] = [];
  for (let i = 0; i < nIn; i++) {
    const txid = bytesToHex(b.slice(o, o + 32).reverse());
    o += 32;
    const vout = dv.getUint32(o, true);
    o += 4;
    let scriptLen: number;
    [scriptLen, o] = readVarint(b, o);
    o += scriptLen;
    const sequence = dv.getUint32(o, true);
    o += 4;
    inputs.push({ txid, vout, sequence });
  }

  let nOut: number;
  [nOut, o] = readVarint(b, o);
  const outputs: TxOutput[] = [];
  for (let i = 0; i < nOut; i++) {
    const value = dv.getBigUint64(o, true);
    o += 8;
    let scriptLen: number;
    [scriptLen, o] = readVarint(b, o);
    const script = b.slice(o, o + scriptLen);
    o += scriptLen;
    outputs.push({ script, value });
  }

  const locktime = dv.getUint32(o, true);
  return { version, inputs, outputs, locktime };
}

/**
 * Sign every input of a node-built raw transaction with one P2PKH key.
 *
 * `prevScripts` maps `txid:vout` to the hex scriptPubKey being spent. Every
 * input must belong to the given key — this is only ever used for spends out of
 * a single authorized branch address.
 */
export function signRawTxWithKey(
  rawHex: string,
  privateKeyHex: string,
  prevScripts: Record<string, string>,
): { hex: string; txid: string } {
  const parsed = parseRawTx(rawHex);
  // Our serializer emits version 2, sequence 0xffffffff, locktime 0. Anything
  // else would change the txid, so refuse rather than silently re-shape it.
  if (parsed.version !== 2 || parsed.locktime !== 0) {
    throw new Error("Unsupported transaction version or locktime");
  }
  if (parsed.inputs.some((i) => i.sequence !== 0xffffffff)) {
    throw new Error("Unsupported input sequence");
  }
  const priv = hexToBytes(privateKeyHex.toLowerCase());
  const pubkey = secp256k1.getPublicKey(priv, true);
  const ownScript = bytesToHex(p2pkhScript(hash160(pubkey)));

  const prev = parsed.inputs.map((inp) => {
    const script = prevScripts[`${inp.txid}:${inp.vout}`];
    if (!script) throw new Error(`Missing previous output script for ${inp.txid}:${inp.vout}`);
    if (script.toLowerCase() !== ownScript) {
      throw new Error("The authorized key does not control every input of this transaction");
    }
    return hexToBytes(script.toLowerCase());
  });

  const asUtxo = (i: number): Utxo => ({
    txid: parsed.inputs[i].txid,
    vout: parsed.inputs[i].vout,
    scriptPubKey: bytesToHex(prev[i]),
    amount: 0,
  });

  const scriptSigs: Uint8Array[] = [];
  for (let i = 0; i < parsed.inputs.length; i++) {
    const preimageInputs = parsed.inputs.map((_, j) => ({
      utxo: asUtxo(j),
      script: j === i ? prev[i] : new Uint8Array(0),
    }));
    const preimage = concat(serialize(preimageInputs, parsed.outputs), u32le(SIGHASH_ALL));
    const sig = secp256k1.sign(dsha256(preimage), priv, { format: "der", prehash: false });
    scriptSigs.push(concat(pushData(concat(sig, Uint8Array.of(SIGHASH_ALL))), pushData(pubkey)));
  }

  const raw = serialize(
    parsed.inputs.map((_, i) => ({ utxo: asUtxo(i), script: scriptSigs[i] })),
    parsed.outputs,
  );
  return { hex: bytesToHex(raw), txid: bytesToHex(dsha256(raw).reverse()) };
}
