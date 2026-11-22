import { describe, expect, test } from "bun:test";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { buildEscrowScript, buildEscrowTx, escrowAddress, finalizeEscrowTx, p2pkhAddress, p2pkhScript, parseEscrowScript, signEscrowInput, verifyEscrowSig } from "./escrow";

const key = (n: number) => { const priv = new Uint8Array(32); priv[31] = n; return { priv, pub: secp256k1.getPublicKey(priv, true) }; };
const B = key(1), L = key(2), S = key(3), X = key(4);
const rs = buildEscrowScript({ borrowerPub: B.pub, lenderPub: L.pub, seedsPub: S.pub });
const TXC_P2PKH = 66;

describe("Seeds Lend lockbox", () => {
  test("is a standard 2-of-3 script that parses back to the same three keys", () => {
    expect(rs.length).toBe(105);
    expect(rs[0]).toBe(0x52);
    expect(rs[104]).toBe(0xae);
    const k = parseEscrowScript(rs)!;
    expect(bytesToHex(k.borrowerPub)).toBe(bytesToHex(B.pub));
    expect(bytesToHex(k.lenderPub)).toBe(bytesToHex(L.pub));
    expect(bytesToHex(k.seedsPub)).toBe(bytesToHex(S.pub));
  });
  test("refuses a lockbox where two keys are the same (that would let one party act alone)", () => {
    expect(() => buildEscrowScript({ borrowerPub: B.pub, lenderPub: B.pub, seedsPub: S.pub })).toThrow();
  });
  test("lives at a TXC P2SH address", () => {
    expect(escrowAddress(rs).startsWith("T")).toBe(true);
  });
  test("pays out only with two valid signatures, in key order", () => {
    const tx = buildEscrowTx([{ txid: "aa".repeat(32), vout: 0, value: 1_000_000n }], [{ script: p2pkhScript(p2pkhAddress(B.pub, TXC_P2PKH), TXC_P2PKH), value: 990_000n }]);
    const sb = signEscrowInput(tx, 0, rs, B.priv), ss = signEscrowInput(tx, 0, rs, S.priv);
    expect(verifyEscrowSig(tx, 0, rs, sb, B.pub)).toBe(true);
    expect(verifyEscrowSig(tx, 0, rs, sb, L.pub)).toBe(false);
    const hex = finalizeEscrowTx(tx, rs, [{ seeds: ss, borrower: sb }]);
    // scriptSig starts with OP_0 then the borrower signature (borrower comes before Seeds).
    const raw = hexToBytes(hex);
    const lenAt = 4 + 1 + 32 + 4; // version, input count, outpoint
    const scriptSigStart = lenAt + (raw[lenAt]! < 0xfd ? 1 : 3);
    expect(raw[scriptSigStart]).toBe(0x00);
    expect(bytesToHex(raw.slice(scriptSigStart + 2, scriptSigStart + 2 + sb.length))).toBe(bytesToHex(sb));
  });
  test("one signature alone, or a signature from an outside key, is refused", () => {
    const tx = buildEscrowTx([{ txid: "bb".repeat(32), vout: 1, value: 500_000n }], [{ script: p2pkhScript(p2pkhAddress(L.pub, TXC_P2PKH), TXC_P2PKH), value: 490_000n }]);
    expect(() => finalizeEscrowTx(tx, rs, [{ seeds: signEscrowInput(tx, 0, rs, S.priv) }])).toThrow();
    expect(() => finalizeEscrowTx(tx, rs, [{ lender: signEscrowInput(tx, 0, rs, X.priv), seeds: signEscrowInput(tx, 0, rs, S.priv) }])).toThrow();
  });
  test("can't pay out more than the lockbox holds", () => {
    expect(() => buildEscrowTx([{ txid: "cc".repeat(32), vout: 0, value: 100n }], [{ script: new Uint8Array(25), value: 101n }])).toThrow();
  });
  test("rejects an address from another network as a payout", () => {
    expect(() => p2pkhScript(p2pkhAddress(B.pub, 0), TXC_P2PKH)).toThrow();
  });
});
