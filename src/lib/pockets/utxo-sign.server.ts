/**
 * Dogecoin and Bitcoin Cash P2PKH send builder/signer (pure bytes, no network).
 *
 * DOGE: classic pre-segwit SIGHASH_ALL. BCH: BIP-143-style digest with
 * SIGHASH_ALL|FORKID (0x41), which also commits to every input amount.
 * Output order for THORChain inbound: [vault, change?, OP_RETURN memo].
 * Zcash (v5 / ZIP-244) is intentionally not here yet — see coins.ts "planned".
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { createBase58check } from "@scure/base";
import { cashAddrToHash, concat, hash160 } from "./encode";

export type UtxoFamily = "DOGE" | "BCH";
export type SpendableUtxo = { txid: string; vout: number; value: bigint };
export type SignedUtxoTx = { hex: string; txid: string; fee: bigint; change: bigint };

const b58c = createBase58check(sha256);
export const UTXO_RULES: Record<UtxoFamily, { p2pkh: number; p2sh: number; dust: bigint }> = {
  // Dogecoin Core 1.14.x treats < 0.01 DOGE as dust.
  DOGE: { p2pkh: 30, p2sh: 22, dust: 1_000_000n },
  BCH: { p2pkh: 0, p2sh: 5, dust: 546n },
};
const MEMO_MAX = 80;

const dsha = (b: Uint8Array) => sha256(sha256(b));
function u32(n: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; }
function u64(n: bigint) { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, n, true); return b; }
function varint(n: number) {
  if (n < 0xfd) return Uint8Array.of(n);
  if (n <= 0xffff) return Uint8Array.of(0xfd, n & 0xff, n >> 8);
  return concat(Uint8Array.of(0xfe), u32(n));
}
const pushData = (d: Uint8Array) => d.length < 0x4c ? concat(Uint8Array.of(d.length), d) : concat(Uint8Array.of(0x4c, d.length), d);
const p2pkh = (h: Uint8Array) => concat(Uint8Array.of(0x76, 0xa9, 0x14), h, Uint8Array.of(0x88, 0xac));
const p2sh = (h: Uint8Array) => concat(Uint8Array.of(0xa9, 0x14), h, Uint8Array.of(0x87));

export function memoScript(memo: string): Uint8Array {
  const m = new TextEncoder().encode(memo);
  if (m.length === 0 || m.length > MEMO_MAX) throw new Error(`Memo must be 1–${MEMO_MAX} bytes`);
  return concat(Uint8Array.of(0x6a), pushData(m));
}

export function utxoAddressToScript(family: UtxoFamily, address: string): Uint8Array {
  if (family === "BCH" && !/^[13]/.test(address)) return p2pkh(cashAddrToHash(address));
  const raw = b58c.decode(address);
  if (raw.length !== 21) throw new Error("Bad address");
  const r = UTXO_RULES[family];
  if (raw[0] === r.p2pkh) return p2pkh(raw.slice(1));
  if (raw[0] === r.p2sh) return p2sh(raw.slice(1));
  throw new Error(`Not a ${family} address`);
}

/** Legacy P2PKH size estimate: 148/in, 34/out, 10 overhead, plus the OP_RETURN. */
export function estimateBytes(nIn: number, nOut: number, memoLen = 0): number {
  return 10 + nIn * 148 + nOut * 34 + (memoLen ? 11 + memoLen : 0);
}

export type UtxoSendParams = {
  family: UtxoFamily;
  privateKey: Uint8Array;
  utxos: SpendableUtxo[];
  to: string;
  amount: bigint;
  /** sats per byte */
  feeRate: number;
  memo?: string;
  /** Defaults to the sender (pocket) address — THORChain refunds to the first input's address. */
  changeAddress?: string;
};

export function buildAndSignUtxoSend(p: UtxoSendParams): SignedUtxoTx {
  const rules = UTXO_RULES[p.family];
  if (p.amount < rules.dust) throw new Error("Amount is below the dust limit");
  if (!Number.isFinite(p.feeRate) || p.feeRate <= 0) throw new Error("Bad fee rate");
  const pub = secp256k1.getPublicKey(p.privateKey, true);
  const ownScript = p2pkh(hash160(pub));
  const toScript = utxoAddressToScript(p.family, p.to);
  const changeScript = p.changeAddress ? utxoAddressToScript(p.family, p.changeAddress) : ownScript;
  const memo = p.memo ? memoScript(p.memo) : null;
  const memoLen = p.memo ? new TextEncoder().encode(p.memo).length : 0;

  // Largest-first selection; deterministic for the same UTXO set.
  const sorted = [...p.utxos].sort((a, b) => (b.value > a.value ? 1 : b.value < a.value ? -1 : 0));
  const chosen: SpendableUtxo[] = [];
  let total = 0n;
  let fee = 0n;
  for (const u of sorted) {
    chosen.push(u);
    total += u.value;
    fee = BigInt(Math.ceil(estimateBytes(chosen.length, 2, memoLen) * p.feeRate));
    if (total >= p.amount + fee) break;
  }
  if (total < p.amount + fee) throw new Error("Not enough funds in the pocket for amount + network fee");
  let change = total - p.amount - fee;
  if (change < rules.dust) { fee += change; change = 0n; }

  const outputs: { script: Uint8Array; value: bigint }[] = [{ script: toScript, value: p.amount }];
  if (change > 0n) outputs.push({ script: changeScript, value: change });
  if (memo) outputs.push({ script: memo, value: 0n });

  const ins = chosen.map((u) => ({ prev: concat(hexToBytes(u.txid).reverse(), u32(u.vout)), value: u.value }));
  const serOut = (o: { script: Uint8Array; value: bigint }) => concat(u64(o.value), varint(o.script.length), o.script);
  const outsBytes = concat(varint(outputs.length), ...outputs.map(serOut));
  const SEQ = u32(0xffffffff);
  const version = u32(p.family === "BCH" ? 2 : 1);
  const lock = u32(0);

  const sigs = ins.map((inp, i) => {
    let digest: Uint8Array;
    let hashType: number;
    if (p.family === "BCH") {
      hashType = 0x41;
      const hashPrevouts = dsha(concat(...ins.map((x) => x.prev)));
      const hashSequence = dsha(concat(...ins.map(() => SEQ)));
      const hashOutputs = dsha(concat(...outputs.map(serOut)));
      digest = dsha(concat(version, hashPrevouts, hashSequence, inp.prev, varint(ownScript.length), ownScript,
        u64(inp.value), SEQ, hashOutputs, lock, u32(hashType)));
    } else {
      hashType = 0x01;
      const body = ins.map((x, j) => concat(x.prev, j === i ? concat(varint(ownScript.length), ownScript) : Uint8Array.of(0), SEQ));
      digest = dsha(concat(version, varint(ins.length), ...body, outsBytes, lock, u32(hashType)));
    }
    const der = secp256k1.sign(digest, p.privateKey, { format: "der", prehash: false });
    return concat(pushData(concat(der, Uint8Array.of(hashType))), pushData(pub));
  });

  const tx = concat(version, varint(ins.length),
    ...ins.map((x, i) => concat(x.prev, varint(sigs[i].length), sigs[i], SEQ)), outsBytes, lock);
  return { hex: bytesToHex(tx), txid: bytesToHex(dsha(tx).reverse()), fee, change };
}
