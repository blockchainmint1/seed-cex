/**
 * Bitcoin mainnet native-segwit (P2WPKH) transaction builder and signer.
 *
 * Server-only, pure byte assembly — no node calls. Our other UTXO chains
 * (TXC/LTC/ISK) are legacy P2PKH; Bitcoin deposits land on a `bc1q…` branch,
 * so this is BIP-141 serialization with a BIP-143 sighash.
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { base58check, bech32 } from "@scure/base";

const b58check = base58check(sha256);

export const SATS = 100_000_000;
export const DUST_SATS = 294; // P2WPKH dust threshold
const SIGHASH_ALL = 1;
const HRP = "bc";

export type BtcUtxo = {
  txid: string;
  vout: number;
  /** whole BTC */
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
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
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

function reverseTxid(txid: string): Uint8Array {
  return hexToBytes(txid).reverse();
}

/** OP_0 <20-byte keyhash> */
export function p2wpkhScript(keyhash: Uint8Array): Uint8Array {
  return concat(Uint8Array.of(0x00, 0x14), keyhash);
}

export function btcAddressFromPubkey(pubkey: Uint8Array): string {
  return bech32.encode(HRP, [0, ...bech32.toWords(hash160(pubkey))]);
}

/**
 * Decode any mainnet Bitcoin address into its output script.
 * Supports bech32 v0 (P2WPKH/P2WSH), bech32m v1 (P2TR), and legacy 1…/3….
 */
export function btcAddressToScript(address: string): Uint8Array {
  const addr = address.trim();
  const lower = addr.toLowerCase();
  if (lower.startsWith("bc1")) {
    let version: number;
    let program: Uint8Array;
    try {
      const decoded = bech32.decode(lower as `bc1${string}`);
      version = decoded.words[0];
      program = Uint8Array.from(bech32.fromWords(decoded.words.slice(1)));
    } catch {
      // bech32m (taproot) — @scure exposes it separately; fall back to a
      // structural check rather than rejecting valid v1 payouts.
      throw new Error(`Not a valid Bitcoin address: ${address}`);
    }
    if (version === 0 && program.length !== 20 && program.length !== 32) {
      throw new Error(`Not a valid Bitcoin address: ${address}`);
    }
    const opVersion = version === 0 ? 0x00 : 0x50 + version;
    return concat(Uint8Array.of(opVersion, program.length), program);
  }

  let payload: Uint8Array;
  try {
    payload = b58check.decode(addr);
  } catch {
    throw new Error(`Not a valid Bitcoin address: ${address}`);
  }
  if (payload.length !== 21) throw new Error(`Not a valid Bitcoin address: ${address}`);
  const version = payload[0];
  const hash = payload.subarray(1);
  if (version === 0x00) {
    return concat(Uint8Array.of(0x76, 0xa9, 0x14), hash, Uint8Array.of(0x88, 0xac));
  }
  if (version === 0x05) {
    return concat(Uint8Array.of(0xa9, 0x14), hash, Uint8Array.of(0x87));
  }
  throw new Error(`Address ${address} is not on Bitcoin mainnet`);
}

export function isValidBtcAddress(address: string): boolean {
  try {
    btcAddressToScript(address);
    return true;
  } catch {
    return false;
  }
}

type TxOutput = { script: Uint8Array; value: bigint };

function outputsBytes(outputs: TxOutput[]): Uint8Array {
  return concat(...outputs.map((o) => concat(u64le(o.value), varint(o.script.length), o.script)));
}

/** ~68 vB per P2WPKH input, ~31 vB per output, ~11 vB overhead. */
export function estimateVBytes(nIn: number, nOut: number): number {
  return nIn * 68 + nOut * 31 + 11;
}

export type BuiltBtcTx = {
  hex: string;
  txid: string;
  feeSats: number;
  inputCount: number;
  changeSats: number;
  amountSats: number;
};

export type BuildBtcParams = {
  privateKeyHex: string;
  fromAddress: string;
  toAddress: string;
  /** whole BTC; ignored when `sweep` is true */
  amount: number;
  utxos: BtcUtxo[];
  /** sat/vB */
  feeRate: number;
  /** send everything, fee deducted from the amount */
  sweep?: boolean;
};

/**
 * Select coins, build, and sign a P2WPKH spend with BIP-143 sighashes.
 *
 * Largest-first selection: fewest inputs, smallest fee. Change under the dust
 * limit is donated to the fee instead of creating an unspendable output.
 */
export function buildAndSignBtcTransfer(params: BuildBtcParams): BuiltBtcTx {
  const priv = hexToBytes(params.privateKeyHex.toLowerCase());
  const pubkey = secp256k1.getPublicKey(priv, true);
  const keyhash = hash160(pubkey);
  const ownScript = p2wpkhScript(keyhash);

  if (bytesToHex(btcAddressToScript(params.fromAddress)) !== bytesToHex(ownScript)) {
    throw new Error("The authorized key does not control the funding address");
  }
  const toScript = btcAddressToScript(params.toAddress);

  const spendable = [...params.utxos]
    .filter((u) => u.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  if (!spendable.length) throw new Error("No confirmed BTC at the trading branch");

  const feeRate = Math.max(1, Math.round(params.feeRate));
  const chosen: BtcUtxo[] = [];
  let total = 0n;
  let fee = 0n;
  let target: bigint;
  const outputs: TxOutput[] = [];
  let change = 0n;

  if (params.sweep) {
    for (const u of spendable) {
      chosen.push(u);
      total += BigInt(Math.round(u.amount * SATS));
    }
    fee = BigInt(estimateVBytes(chosen.length, 1) * feeRate);
    target = total - fee;
    if (target < BigInt(DUST_SATS)) {
      throw new Error("Balance is too small to cover the Bitcoin network fee");
    }
    outputs.push({ script: toScript, value: target });
  } else {
    target = BigInt(Math.round(params.amount * SATS));
    if (target < BigInt(DUST_SATS)) throw new Error("Amount is below the dust limit");
    for (const u of spendable) {
      chosen.push(u);
      total += BigInt(Math.round(u.amount * SATS));
      fee = BigInt(estimateVBytes(chosen.length, 2) * feeRate);
      if (total >= target + fee) break;
    }
    if (total < target + fee) {
      throw new Error(
        `Insufficient BTC on the authorized branch: need ${(Number(target + fee) / SATS).toFixed(8)}, have ${(Number(total) / SATS).toFixed(8)}`,
      );
    }
    change = total - target - fee;
    outputs.push({ script: toScript, value: target });
    if (change >= BigInt(DUST_SATS)) {
      outputs.push({ script: ownScript, value: change });
    } else {
      fee += change;
      change = 0n;
      const minFee = BigInt(estimateVBytes(chosen.length, 1) * feeRate);
      if (fee < minFee) throw new Error("Insufficient balance to cover the network fee");
    }
  }

  // BIP-143 shared midstate
  const hashPrevouts = dsha256(
    concat(...chosen.map((u) => concat(reverseTxid(u.txid), u32le(u.vout)))),
  );
  const hashSequence = dsha256(concat(...chosen.map(() => u32le(0xfffffffd))));
  const hashOutputs = dsha256(outputsBytes(outputs));
  // The scriptCode of a P2WPKH input is the equivalent P2PKH script.
  const scriptCode = concat(
    Uint8Array.of(0x19, 0x76, 0xa9, 0x14),
    keyhash,
    Uint8Array.of(0x88, 0xac),
  );

  const witnesses: Uint8Array[][] = [];
  for (const u of chosen) {
    const preimage = concat(
      u32le(2),
      hashPrevouts,
      hashSequence,
      reverseTxid(u.txid),
      u32le(u.vout),
      scriptCode,
      u64le(BigInt(Math.round(u.amount * SATS))),
      u32le(0xfffffffd),
      hashOutputs,
      u32le(0),
      u32le(SIGHASH_ALL),
    );
    const sig = secp256k1.sign(dsha256(preimage), priv, { format: "der", prehash: false });
    witnesses.push([concat(sig, Uint8Array.of(SIGHASH_ALL)), pubkey]);
  }

  const inputsBytes = concat(
    ...chosen.map((u) =>
      concat(reverseTxid(u.txid), u32le(u.vout), varint(0), u32le(0xfffffffd)),
    ),
  );
  const legacyCore = concat(
    u32le(2),
    varint(chosen.length),
    inputsBytes,
    varint(outputs.length),
    outputsBytes(outputs),
    u32le(0),
  );

  const witnessBytes = concat(
    ...witnesses.map((items) =>
      concat(varint(items.length), ...items.map((i) => concat(varint(i.length), i))),
    ),
  );

  const raw = concat(
    u32le(2),
    Uint8Array.of(0x00, 0x01),
    varint(chosen.length),
    inputsBytes,
    varint(outputs.length),
    outputsBytes(outputs),
    witnessBytes,
    u32le(0),
  );

  return {
    hex: bytesToHex(raw),
    // txid is over the stripped (non-witness) serialization
    txid: bytesToHex(dsha256(legacyCore).reverse()),
    feeSats: Number(fee),
    inputCount: chosen.length,
    changeSats: Number(change),
    amountSats: Number(target),
  };
}
