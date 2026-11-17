import { describe, expect, test as it } from "bun:test";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import {
  LOCK_CSV_BLOCKS, LOCK_SAFETY_MARGIN, bip143Sighash, buildLockScript, cooperativeWitness, deriveSeedsLockKey,
  lockAddress, lockScriptPubKey, lockStrength, parseLockScript, refundSequence, refundWitness, serializeTx,
  signLockInput, verifyLockSig, type Tx,
} from "./script";

// Generator points G and 2G — public, well-known keys used only as fixtures.
const G = hexToBytes("0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798");
const G2 = hexToBytes("02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5");

describe("lock script", () => {
  it("matches the live TEXITcoin node byte-for-byte (decodescript, 4320-block refund)", () => {
    const s = buildLockScript({ seedsPub: G, memberPub: G2, csvBlocks: 4320 });
    expect(bytesToHex(s)).toBe("6321" + bytesToHex(G) + "ad6702e010b275682102c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5ac");
    expect(lockAddress(s, "TXC")).toBe("txc1q94kwcsezvh935egqskkcnsn853qhplwdpcdj7z4l5eyvqgk7wn7q80vvkj");
    expect(bytesToHex(lockScriptPubKey(s))).toBe("00202d6cec432265cb1a650085ad89c267a44170fdcd0e1b2f0abfa648c022de74fc");
  });
  it("ISK locks use the isk1 address prefix", () =>
    expect(lockAddress(buildLockScript({ seedsPub: G, memberPub: G2, csvBlocks: 4320 }), "ISK").startsWith("isk1q")).toBe(true));
  it("the default refund delay is 14,400 blocks (~30 days) with a 960-block (~2 day) safety margin", () => {
    expect(LOCK_CSV_BLOCKS).toBe(14_400);
    expect(LOCK_SAFETY_MARGIN).toBe(960);
  });
  it("parses its own template back to the same keys and delay", () => {
    for (const csv of [17, 127, 128, 255, 4320, 14_400, 32_767, 32_768, 65_535]) {
      const t = parseLockScript(buildLockScript({ seedsPub: G, memberPub: G2, csvBlocks: csv }));
      expect(t?.csvBlocks).toBe(csv);
      expect(bytesToHex(t!.seedsPub)).toBe(bytesToHex(G));
      expect(bytesToHex(t!.memberPub)).toBe(bytesToHex(G2));
    }
  });
  it("refuses anything that isn't exactly the lock", () => {
    const s = buildLockScript({ seedsPub: G, memberPub: G2, csvBlocks: 4320 });
    expect(parseLockScript(s.slice(0, -1))).toBeNull();
    const swappedOp = s.slice(); swappedOp[35] = 0xac; expect(parseLockScript(swappedOp)).toBeNull();
    const extra = new Uint8Array(s.length + 1); extra.set(s); extra[s.length] = 0x75; expect(parseLockScript(extra)).toBeNull();
  });
  it("rejects same keys, uncompressed keys and out-of-range delays", () => {
    expect(() => buildLockScript({ seedsPub: G, memberPub: G, csvBlocks: 4320 })).toThrow();
    expect(() => buildLockScript({ seedsPub: new Uint8Array(65), memberPub: G2, csvBlocks: 4320 })).toThrow();
    expect(() => buildLockScript({ seedsPub: G, memberPub: G2, csvBlocks: 16 })).toThrow();
    expect(() => buildLockScript({ seedsPub: G, memberPub: G2, csvBlocks: 65_536 })).toThrow();
  });
});

describe("lock strength (when Seeds may settle instantly)", () => {
  it("fresh coins are strong", () => expect(lockStrength([1, 50]).state).toBe("strong"));
  it("coins 12,480 blocks old (14,400 − 2×960) need a refresh soon", () => expect(lockStrength([12_480]).state).toBe("refreshing_soon"));
  it("coins 13,440 blocks old (14,400 − 960) are no longer safe for instant settlement", () => expect(lockStrength([13_440]).state).toBe("weak"));
  it("one old coin weakens the whole lock", () => expect(lockStrength([3, 13_500]).state).toBe("weak"));
});

describe("Seeds lock key", () => {
  const master = new Uint8Array(32).fill(7);
  it("is the same every time for the same member and chain", () =>
    expect(bytesToHex(deriveSeedsLockKey(master, "m1", "TXC").publicKey)).toBe(bytesToHex(deriveSeedsLockKey(master, "m1", "TXC").publicKey)));
  it("differs per member, chain and generation", () => {
    const a = bytesToHex(deriveSeedsLockKey(master, "m1", "TXC").publicKey);
    expect(bytesToHex(deriveSeedsLockKey(master, "m2", "TXC").publicKey)).not.toBe(a);
    expect(bytesToHex(deriveSeedsLockKey(master, "m1", "ISK").publicKey)).not.toBe(a);
    expect(bytesToHex(deriveSeedsLockKey(master, "m1", "TXC", 1).publicKey)).not.toBe(a);
  });
  it("refuses a short master secret", () => expect(() => deriveSeedsLockKey(new Uint8Array(16), "m1", "TXC")).toThrow());
});

describe("BIP143 signing", () => {
  it("matches the official BIP143 native P2WPKH test vector", () => {
    const tx: Tx = {
      version: 1, locktime: 0x11,
      inputs: [
        { txid: "9f96ade4b41d5433f4eda31e1738ec2b36f6e7d1420d94a6af99801a88f7f7ff", vout: 0, sequence: 0xffffffee },
        { txid: "8ac60eb9575db5b2d987e29f301b5b819ea83a5c6579d282d189cc04b8e151ef", vout: 1, sequence: 0xffffffff },
      ],
      outputs: [
        { value: 112340000n, script: hexToBytes("76a9148280b37df378db99f66f85c95a783a76ac7a6d5988ac") },
        { value: 223450000n, script: hexToBytes("76a9143bde42dbee7e4dbe6a21b2d50ce2f0167faa815988ac") },
      ],
    };
    const h = bip143Sighash(tx, 1, hexToBytes("76a9141d0f172a0ecb48aee1be1f2687d2963ae33f71a188ac"), 600000000n);
    expect(bytesToHex(h)).toBe("c37af31116d1b27caf68aae9e3ac82f1477929014d5b917657d0eb49478cb670");
  });

  const memberKey = secp256k1.utils.randomSecretKey();
  const seeds = deriveSeedsLockKey(new Uint8Array(32).fill(9), "m1", "TXC");
  const ws = buildLockScript({ seedsPub: seeds.publicKey, memberPub: secp256k1.getPublicKey(memberKey, true), csvBlocks: LOCK_CSV_BLOCKS });
  const tx: Tx = { version: 2, locktime: 0, inputs: [{ txid: "11".repeat(32), vout: 0, sequence: 0xfffffffd }], outputs: [{ value: 5000n, script: lockScriptPubKey(ws) }] };

  it("both signatures verify on a cooperative spend", () => {
    const m = signLockInput(tx, 0, ws, 10_000n, memberKey);
    const s = signLockInput(tx, 0, ws, 10_000n, seeds.privateKey);
    expect(verifyLockSig(tx, 0, ws, 10_000n, m, secp256k1.getPublicKey(memberKey, true))).toBe(true);
    expect(verifyLockSig(tx, 0, ws, 10_000n, s, seeds.publicKey)).toBe(true);
    expect(cooperativeWitness(m, s, ws).length).toBe(4);
  });
  it("a signature for one amount does not verify for another (amount is committed)", () => {
    const m = signLockInput(tx, 0, ws, 10_000n, memberKey);
    expect(verifyLockSig(tx, 0, ws, 10_001n, m, secp256k1.getPublicKey(memberKey, true))).toBe(false);
  });
  it("a refund spend waits the full delay and uses the member's key alone", () => {
    const refund: Tx = { ...tx, inputs: [{ ...tx.inputs[0]!, sequence: refundSequence(LOCK_CSV_BLOCKS) }] };
    const w = refundWitness(signLockInput(refund, 0, ws, 10_000n, memberKey), ws);
    expect(refund.inputs[0]!.sequence).toBe(14_400);
    expect(w[1]!.length).toBe(0);
    expect(serializeTx(refund, [w])[4]).toBe(0); // segwit marker present
  });
});

import { finalizeLockTx, legacySighash, lockAddressFor, lockP2shAddress, parseUnsignedTx, signLock, verifyLock } from "./script";
describe("legacy P2SH lock", () => {
  it("matches the live TEXITcoin node's P2SH address for the reference script", () =>
    expect(lockP2shAddress(buildLockScript({ seedsPub: G, memberPub: G2, csvBlocks: 4320 }), "TXC")).toBe("TACrLRCQcvdc27MprECthK9XRKA587dDYA"));
  it("ISK P2SH locks start with J", () => expect(lockAddressFor(buildLockScript({ seedsPub: G, memberPub: G2, csvBlocks: 4320 }), "ISK", "p2sh").startsWith("J")).toBe(true));
  const mk = secp256k1.utils.randomSecretKey();
  const sk = secp256k1.utils.randomSecretKey();
  const ws = buildLockScript({ seedsPub: secp256k1.getPublicKey(sk, true), memberPub: secp256k1.getPublicKey(mk, true), csvBlocks: 20 });
  const tx: Tx = { version: 2, locktime: 0, inputs: [{ txid: "22".repeat(32), vout: 1, sequence: 0xffffffff }], outputs: [{ value: 1000n, script: hexToBytes("6a00") }] };
  it("signs and verifies both halves; the redeem script is pushed with OP_PUSHDATA1 (77 bytes for a 20-block test delay)", () => {
    const p = { tx, index: 0, ws, value: 0n, wrapper: "p2sh" as const };
    const m = signLock(p, mk), s = signLock(p, sk);
    expect(verifyLock(p, m, secp256k1.getPublicKey(mk, true))).toBe(true);
    expect(verifyLock(p, s, secp256k1.getPublicKey(mk, true))).toBe(false);
    expect(ws.length).toBe(77);
    const hex = finalizeLockTx(tx, ws, "p2sh", [{ member: m, seeds: s }]);
    expect(hex.includes("514c4d" + bytesToHex(ws))).toBe(true);
  });
  it("the legacy digest changes when any output changes", () => {
    const a = bytesToHex(legacySighash(tx, 0, ws));
    expect(bytesToHex(legacySighash({ ...tx, outputs: [{ value: 999n, script: hexToBytes("6a00") }] }, 0, ws))).not.toBe(a);
  });
  it("round-trips an unsigned node transaction", () => {
    const hex = bytesToHex(serializeTx(tx));
    expect(bytesToHex(serializeTx(parseUnsignedTx(hex)))).toBe(hex);
  });
});
