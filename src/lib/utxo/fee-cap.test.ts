import { describe, expect, test } from "bun:test";
import { bytesToHex } from "@noble/hashes/utils.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { base58check } from "@scure/base";
import { buildAndSignTransfer, p2pkhScript } from "@/lib/txc/tx.server";
import { MAX_SEND_FEE, feeCapChainForVersion, feeCapProblem, maxFeeSats, omniCarrierFeeSats } from "./fee-cap";

const priv = new Uint8Array(32).fill(7);
const pub = secp256k1.getPublicKey(priv, true);
const h160 = ripemd160(sha256(pub));
const txcAddress = base58check(sha256).encode(Uint8Array.from([66, ...h160]));
const script = bytesToHex(p2pkhScript(h160));
const coins = (n: number, each: number) => Array.from({ length: n }, (_, i) => ({ txid: (i + 1).toString(16).padStart(64, "0"), vout: 0, amount: each, scriptPubKey: script }));

describe("send fee limits (Bobby, Nov 21)", () => {
  test("limits are 0.01 TXC, 0.01 ISK, 0.002 LTC", () => {
    expect(MAX_SEND_FEE).toEqual({ txc: 0.01, isk: 0.01, ltc: 0.002 });
    expect(maxFeeSats("txc")).toBe(1_000_000);
    expect(maxFeeSats("isk")).toBe(1_000_000);
    expect(maxFeeSats("ltc")).toBe(200_000);
  });
  test("a fee right at the limit passes, one satoshi more is refused", () => {
    expect(feeCapProblem("txc", 1_000_000)).toBe(null);
    expect(feeCapProblem("txc", 1_000_001)).toContain("Nothing was sent");
  });
  test("every chain the builder signs has a limit; an unknown one is refused", () => {
    expect(feeCapChainForVersion(66)).toBe("txc");
    expect(feeCapChainForVersion(45)).toBe("isk");
    expect(feeCapChainForVersion(48)).toBe("ltc");
    expect(() => feeCapChainForVersion(0)).toThrow();
  });
  test("a normal one-coin TXC send at 10 sat/vB fits under the limit", () => {
    const tx = buildAndSignTransfer({ privateKeyHex: bytesToHex(priv), fromAddress: txcAddress, toAddress: txcAddress, amount: 1, utxos: coins(1, 5), feeRate: 10 });
    expect(tx.feeSats).toBeLessThanOrEqual(1_000_000);
  });
  test("a TXC send needing 50 small coins at 10 sat/vB still goes through", () => {
    const tx = buildAndSignTransfer({ privateKeyHex: bytesToHex(priv), fromAddress: txcAddress, toAddress: txcAddress, amount: 49.5, utxos: coins(50, 1), feeRate: 10 });
    expect(tx.inputCount).toBe(50);
  });
  test("7 coins at 1,000 sat/vB (over 0.01 TXC in fees) is refused before signing", () => {
    expect(() => buildAndSignTransfer({ privateKeyHex: bytesToHex(priv), fromAddress: txcAddress, toAddress: txcAddress, amount: 6.5, utxos: coins(7, 1), feeRate: 1000 })).toThrow(/above Seeds' limit of 0.01 TXC/);
  });
  test("a wild fee rate can't drain a pocket", () => {
    expect(() => buildAndSignTransfer({ privateKeyHex: bytesToHex(priv), fromAddress: txcAddress, toAddress: txcAddress, amount: 1, utxos: coins(1, 100), feeRate: 5000 })).toThrow(/Nothing was sent/);
  });
  test("a one-coin TSD carrier at 10 sat/vB costs 0.0000258 TXC, under the limit", () => {
    expect(omniCarrierFeeSats(1, 10)).toBe(2_580);
    expect(feeCapProblem("txc", omniCarrierFeeSats(1, 10))).toBe(null);
  });
});
