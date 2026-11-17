/**
 * Solana native SOL transfer + SPL Memo, legacy message format, ed25519-signed.
 * Accounts: [from (signer, writable), to (writable), System, Memo v2 (read-only)].
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
import { concat } from "./encode";

const SYSTEM = new Uint8Array(32);
const MEMO = base58.decode("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

function shortvec(n: number): Uint8Array {
  const out: number[] = [];
  do { let b = n & 0x7f; n >>= 7; if (n) b |= 0x80; out.push(b); } while (n);
  return Uint8Array.from(out);
}
function u64(n: bigint) { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, n, true); return b; }

export type SolTransferParams = {
  privateKey: Uint8Array;
  to: string;
  lamports: bigint;
  recentBlockhash: string;
  memo?: string;
};

export function signSolTransfer(p: SolTransferParams): { base64: string; signature: string; from: string } {
  if (p.lamports <= 0n) throw new Error("Amount must be positive");
  const from = ed25519.getPublicKey(p.privateKey);
  const to = base58.decode(p.to);
  if (to.length !== 32) throw new Error("Bad Solana address");
  if (to.every((v, i) => v === from[i])) throw new Error("Refusing to send to self");
  const bh = base58.decode(p.recentBlockhash);
  if (bh.length !== 32) throw new Error("Bad blockhash");
  const memo = p.memo ? new TextEncoder().encode(p.memo) : null;
  const keys = memo ? [from, to, SYSTEM, MEMO] : [from, to, SYSTEM];
  const header = Uint8Array.of(1, 0, keys.length - 2);
  const transfer = concat(Uint8Array.of(2), shortvec(2), Uint8Array.of(0, 1), shortvec(12), Uint8Array.of(2, 0, 0, 0), u64(p.lamports));
  const ixs = [transfer];
  if (memo) ixs.push(concat(Uint8Array.of(3), shortvec(0), shortvec(memo.length), memo));
  const message = concat(header, shortvec(keys.length), ...keys, bh, shortvec(ixs.length), ...ixs);
  const sig = ed25519.sign(message, p.privateKey);
  const tx = concat(shortvec(1), sig, message);
  return { base64: btoa(String.fromCharCode(...tx)), signature: base58.encode(sig), from: base58.encode(from) };
}
