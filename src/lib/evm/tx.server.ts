/**
 * EVM (EIP-1559) transaction builder and signer.
 *
 * Server-only, pure byte assembly: RLP encoding, keccak hashing, secp256k1
 * signing. No network calls here so the encoding can be reasoned about (and
 * unit-checked) on its own.
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

/* ---------------------------------- rlp ----------------------------------- */

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function toMinimalBytes(value: bigint): Uint8Array {
  if (value < 0n) throw new Error("Negative values cannot be RLP encoded");
  if (value === 0n) return new Uint8Array(0);
  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  return hexToBytes(hex);
}

function encodeLength(len: number, offset: number): Uint8Array {
  if (len < 56) return Uint8Array.of(offset + len);
  const lenBytes = toMinimalBytes(BigInt(len));
  return concat(Uint8Array.of(offset + 55 + lenBytes.length), lenBytes);
}

type RlpInput = Uint8Array | RlpInput[];

function rlpEncode(input: RlpInput): Uint8Array {
  if (input instanceof Uint8Array) {
    if (input.length === 1 && input[0] < 0x80) return input;
    return concat(encodeLength(input.length, 0x80), input);
  }
  const body = concat(...input.map(rlpEncode));
  return concat(encodeLength(body.length, 0xc0), body);
}

/* --------------------------------- helpers -------------------------------- */

export function isValidEvmAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

function addressBytes(address: string): Uint8Array {
  if (!isValidEvmAddress(address)) throw new Error(`Not a valid EVM address: ${address}`);
  return hexToBytes(address.slice(2).toLowerCase());
}

/** Lowercase 0x address derived from an uncompressed secp256k1 public key. */
export function addressFromPrivateKey(privateKeyHex: string): string {
  const pub = secp256k1.getPublicKey(hexToBytes(privateKeyHex.toLowerCase()), false);
  return `0x${bytesToHex(keccak_256(pub.subarray(1)).subarray(-20))}`;
}

/** `transfer(address,uint256)` calldata — selector 0xa9059cbb. */
export function erc20TransferData(to: string, amount: bigint): string {
  const dest = bytesToHex(addressBytes(to)).padStart(64, "0");
  const value = amount.toString(16).padStart(64, "0");
  return `0xa9059cbb${dest}${value}`;
}

/** Whole units → base units, without float rounding drift. */
export function toBaseUnits(amount: number, decimals: number): bigint {
  const [whole, frac = ""] = amount.toFixed(decimals).split(".");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
}

/* --------------------------------- signing -------------------------------- */

export type EvmTxParams = {
  privateKeyHex: string;
  chainId: number;
  nonce: number;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  gasLimit: bigint;
  to: string;
  value: bigint;
  /** 0x-prefixed calldata, or "0x" for a plain transfer */
  data: string;
};

export type SignedTx = { raw: string; hash: string; from: string };

/**
 * Sign a type-2 (EIP-1559) transaction.
 *
 * Payload is `0x02 || rlp([chainId, nonce, maxPriority, maxFee, gas, to, value,
 * data, accessList])`, hashed with keccak-256 and signed with a recovery id.
 */
export function signEip1559(params: EvmTxParams): SignedTx {
  const priv = hexToBytes(params.privateKeyHex.toLowerCase());
  const data = hexToBytes((params.data || "0x").slice(2));

  const fields: RlpInput = [
    toMinimalBytes(BigInt(params.chainId)),
    toMinimalBytes(BigInt(params.nonce)),
    toMinimalBytes(params.maxPriorityFeePerGas),
    toMinimalBytes(params.maxFeePerGas),
    toMinimalBytes(params.gasLimit),
    addressBytes(params.to),
    toMinimalBytes(params.value),
    data,
    [],
  ];

  const unsigned = concat(Uint8Array.of(0x02), rlpEncode(fields));
  // "recovered" = 65 bytes: recovery id, then r, then s.
  const sig = secp256k1.sign(keccak_256(unsigned), priv, {
    prehash: false,
    format: "recovered",
  });
  const recovery = BigInt(sig[0]);
  const r = toMinimalBytes(BigInt(`0x${bytesToHex(sig.subarray(1, 33))}`));
  const s = toMinimalBytes(BigInt(`0x${bytesToHex(sig.subarray(33, 65))}`));

  const signed = concat(
    Uint8Array.of(0x02),
    rlpEncode([...(fields as RlpInput[]), toMinimalBytes(recovery), r, s]),
  );

  return {
    raw: `0x${bytesToHex(signed)}`,
    hash: `0x${bytesToHex(keccak_256(signed))}`,
    from: addressFromPrivateKey(params.privateKeyHex),
  };
}
