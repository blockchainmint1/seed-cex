import { describe, expect, test } from "bun:test";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { hex } from "@scure/base";
import { ADA_MAX_FEE, buildCardanoTransfer, memoAuxData, cardanoAddressBytes, cbor, extendedPublicKey, signExtended } from "./cardano-tx";
import { cardanoBaseAddress, softPrivateChild, xprvToXpub } from "./cardano";

const params = { minFeeA: 44n, minFeeB: 155381n, coinsPerUtxoByte: 4310n };

function pocket() {
  const acct = new Uint8Array(96); for (let i = 0; i < 96; i++) acct[i] = (i * 7 + 3) & 0xff;
  acct[0]! &= 0xf8; acct[31]! &= 0x1f; acct[31]! |= 0x40;
  const key = softPrivateChild(softPrivateChild(acct, 0), 0).slice(0, 64);
  return { key, address: cardanoBaseAddress(xprvToXpub(acct)) };
}
const DEST = pocket().address; // any valid base address works as a destination in tests
const OTHER = (() => { const a = new Uint8Array(96).fill(9); a[0]! &= 0xf8; a[31]! &= 0x1f; a[31]! |= 0x40; return cardanoBaseAddress(xprvToXpub(a)); })();

describe("cardano signing", () => {
  test("extended-key signature equals RFC 8032 ed25519 for a clamped seed hash", () => {
    const seed = hex.decode("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60");
    const h = sha512(seed); h[0]! &= 248; h[31]! &= 127; h[31]! |= 64;
    const msg = new TextEncoder().encode("seeds");
    expect(hex.encode(signExtended(h, msg))).toBe(hex.encode(ed25519.sign(msg, seed)));
    expect(hex.encode(extendedPublicKey(h))).toBe(hex.encode(ed25519.getPublicKey(seed)));
  });
  test("CBOR encodes canonical lengths", () => {
    expect(hex.encode(cbor(23))).toBe("17");
    expect(hex.encode(cbor(24))).toBe("1818");
    expect(hex.encode(cbor(1_000_000n))).toBe("1a000f4240");
    expect(hex.encode(cbor([new Uint8Array([1]), new Map([[0, 1]])]))).toBe("824101a10001");
  });
  test("address bytes: base address is 57 bytes; testnet refused", () => {
    expect(cardanoAddressBytes(DEST).length).toBe(57);
    expect(() => cardanoAddressBytes("addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgs68faae")).toThrow();
  });
});

describe("cardano transfer", () => {
  const { key, address } = pocket();
  const utxo = (n: number, lovelace: bigint, hasTokens = false) => ({ txHash: n.toString(16).padStart(64, "0"), index: 0, lovelace, hasTokens });

  test("signs a valid body hash; fee = a·size + b; change back to pocket", () => {
    const t = buildCardanoTransfer({ signingKey: key, fromAddress: address, toAddress: OTHER, lovelace: 5_000_000n, utxos: [utxo(1, 20_000_000n)], params, ttl: 1000 });
    const size = BigInt(hex.decode(t.cborHex).length);
    expect(t.fee).toBeGreaterThanOrEqual(params.minFeeA * size + params.minFeeB);
    expect(t.fee).toBeLessThan(params.minFeeA * size + params.minFeeB + 1000n);
    expect(t.change).toBe(20_000_000n - 5_000_000n - t.fee);
    expect(t.txid).toHaveLength(64);
  });
  test("never spends coins carrying tokens", () => {
    expect(() => buildCardanoTransfer({ signingKey: key, fromAddress: address, toAddress: OTHER, lovelace: 5_000_000n, utxos: [utxo(1, 50_000_000n, true)], params, ttl: 1 })).toThrow(/Not enough ADA/);
  });
  test("refuses a leftover too small to be its own output", () => {
    expect(() => buildCardanoTransfer({ signingKey: key, fromAddress: address, toAddress: OTHER, lovelace: 5_000_000n, utxos: [utxo(1, 5_500_000n)], params, ttl: 1 })).toThrow(/Not enough ADA/);
  });
  test("send everything except the fee leaves no change", () => {
    const first = buildCardanoTransfer({ signingKey: key, fromAddress: address, toAddress: OTHER, lovelace: 3_000_000n, utxos: [utxo(1, 10_000_000n)], params, ttl: 1 });
    const all = buildCardanoTransfer({ signingKey: key, fromAddress: address, toAddress: OTHER, lovelace: 10_000_000n - 170_000n, utxos: [utxo(1, 10_000_000n)], params, ttl: 1 });
    expect(all.change).toBe(0n);
    expect(first.change > 0n).toBe(true);
  });
  test("refuses sends below Cardano's minimum output", () => {
    expect(() => buildCardanoTransfer({ signingKey: key, fromAddress: address, toAddress: OTHER, lovelace: 500_000n, utxos: [utxo(1, 10_000_000n)], params, ttl: 1 })).toThrow(/at least/);
  });
  test("fee cap is 1 ADA", () => { expect(ADA_MAX_FEE).toBe(1_000_000n); });
  test("witness signature verifies against the pocket's payment key", () => {
    const msg = blake2b(new Uint8Array([1, 2, 3]), { dkLen: 32 });
    expect(ed25519.verify(signExtended(key, msg), msg, extendedPublicKey(key))).toBe(true);
  });
});

describe("swap memo metadata (Maya)", () => {
  test("memo goes in label 674 msg, split into 64-byte pieces", () => {
    const m = "=:b:bc1qus60fujtuqfeu50zans4sx7vdk0k9xsryukpqw:2431778/1/0:dh:10-extra-text-to-pass-64";
    const aux = memoAuxData(m);
    const msg = (aux.get(674) as Map<string, string[]>).get("msg")!;
    expect(msg.join("")).toBe(m);
    expect(msg.every((x) => x.length <= 64)).toBe(true);
    expect(msg.length).toBe(2);
  });
  test("non-text or oversized memos are refused", () => {
    expect(() => memoAuxData("é")).toThrow();
    expect(() => memoAuxData("x".repeat(251))).toThrow();
  });
});
