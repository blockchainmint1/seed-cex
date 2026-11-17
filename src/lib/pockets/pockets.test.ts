/**
 * Pocket keys, addresses and signers. Every pinned value below was
 * cross-checked against independent references (bitgo utxo-lib,
 * ripple-binary-codec/keypairs, TronWeb, @solana/web3.js, micro-key-producer)
 * on Nov 17 2026 — see docs/multichain-pockets-audit-2026-11-17.md.
 */
import { describe, expect, test } from "bun:test";
import { hex } from "@scure/base";
import { accountPath, parseAccountPath, validPocket } from "./coins";
import { pocketKeysMatch, pocketReceiveAddress, pocketsFromMnemonic, receivePrivateKey } from "./derive";
import { slip10Ed25519 } from "./slip10";
import { buildAndSignUtxoSend, memoScript } from "./utxo-sign.server";
import { signXrpPayment } from "./xrp-sign.server";
import { signTronTransfer } from "./tron-sign.server";
import { signSolTransfer } from "./sol-sign.server";

const M = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const MEMO = "=:ETH.ETH:0x7231a79714ffD1b9f51216f79762fA38A40b4544:0/1/0";
const b = pocketsFromMnemonic(M, { account: 1106 });
const key = (c: Parameters<typeof receivePrivateKey>[0]) => receivePrivateKey(c, b.xprvs[c]!);

describe("pocket numbers", () => {
  test("only 1106–2105 are pockets; savings account 0 is refused", () => {
    expect(validPocket(1106)).toBe(true);
    expect(validPocket(2105)).toBe(true);
    expect(validPocket(0)).toBe(false);
    expect(validPocket(2106)).toBe(false);
    expect(() => pocketsFromMnemonic(M, { account: 0 })).toThrow();
  });
  test("paths round-trip, including Solana's extra hardened level", () => {
    expect(accountPath("TXC", 1106)).toBe("m/44'/696969'/1106'");
    expect(accountPath("ISK", 1106)).toBe("m/44'/969696'/1106'");
    expect(accountPath("SOL", 1107)).toBe("m/44'/501'/1107'/0'");
    expect(parseAccountPath("m/44'/144'/2105'")).toEqual({ coin: "XRP", account: 2105 });
    expect(parseAccountPath("m/44'/501'/1106'")).toBeNull();
  });
  test("an invalid recovery phrase is refused", () => {
    expect(() => pocketsFromMnemonic("abandon abandon abandon")).toThrow();
  });
});

describe("addresses (pocket 1106 of the BIP-39 test phrase)", () => {
  test.each([
    ["TXC", "Tg7WMV1iBgw6w44Z8ZzftiSKPu1yEStXvy"],
    ["ISK", "KC4qNWsaf9soCJSmzNXjjWDcYwbedST1ht"],
    ["BTC", "bc1q49kxnqa4uuh2ej0k6ys2vrd26nq338pwaf3r30"],
    ["LTC", "LdydRYQJ1fQ4vwpqYn1tUzfLzdfQxZS6cP"],
    ["EVM", "0x7231a79714ffD1b9f51216f79762fA38A40b4544"],
    ["DOGE", "DGd9T3ziwKMXvB4Q5ea9zARewepMc8ER8i"],
    ["BCH", "bitcoincash:qrjldu6tua6hu2cafctlymwnp5s4htehc5wq4ejyak"],
    ["ZEC", "t1JmSHJ4tmAcXn16tDzT5pasbhMVYm7Aq2v"],
    ["XRP", "rJ2grn6pFak4hFP8a7QRiqPQDccxWQYY3x"],
    ["TRX", "TGeDLmuvGeJFV6Vc9ggnwX96mHR19avogD"],
    ["SOL", "DXTivYcF78Vznitg6f8JGXouZwsm3xioik1LGWj2H1jV"],
  ] as const)("%s", (coin, addr) => {
    expect(b.addresses[coin]).toBe(addr);
    expect(pocketReceiveAddress(coin, b.xpubs[coin]!)).toBe(addr);
  });
  test("SLIP-0010 official vector 1 and Solana's standard first account", () => {
    expect(hex.encode(slip10Ed25519(hex.decode("000102030405060708090a0b0c0d0e0f"), "m/0'").privateKey))
      .toBe("68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3");
    expect(() => slip10Ed25519(new Uint8Array(16), "m/0")).toThrow();
  });
  test("a private key that doesn't match its public half is refused", () => {
    const other = pocketsFromMnemonic(M, { account: 1107 });
    expect(pocketKeysMatch("SOL", b.xprvs.SOL!, b.xpubs.SOL!)).toBe(true);
    expect(pocketKeysMatch("SOL", other.xprvs.SOL!, b.xpubs.SOL!)).toBe(false);
    expect(pocketKeysMatch("XRP", other.xprvs.XRP!, b.xpubs.XRP!)).toBe(false);
  });
});

describe("signers", () => {
  const utxos = [{ txid: "aa".repeat(32), vout: 1, value: 5_000_000_000n }, { txid: "bb".repeat(32), vout: 0, value: 200_000_000n }];
  test("DOGE send with memo", () => {
    const r = buildAndSignUtxoSend({ family: "DOGE", privateKey: key("DOGE"), utxos, to: "DRbFs1GDf9F3MGnHy24vPP8h7wCE8nCBAU", amount: 3_000_000_000n, feeRate: 1000, memo: MEMO });
    expect(r.txid).toBe("25457e70720a2d0fbbffb04abc2d9ec84452f3c797aff40f23d289ff1aef6f85");
    expect(r.fee).toBe(295_000n);
  });
  test("BCH send with memo (FORKID)", () => {
    const r = buildAndSignUtxoSend({ family: "BCH", privateKey: key("BCH"), utxos, to: "qrs928gzftvvlm0ukyuu3hwx90jadhz66y3f968clg", amount: 3_000_000_000n, feeRate: 2, memo: MEMO });
    expect(r.txid).toBe("92430cf478ed486b7c0b32f3b392e55bd9c0968d03510e4b33984ac676442d1d");
  });
  test("UTXO guards: dust, memo size, insufficient funds", () => {
    expect(() => buildAndSignUtxoSend({ family: "BCH", privateKey: key("BCH"), utxos, to: "qrs928gzftvvlm0ukyuu3hwx90jadhz66y3f968clg", amount: 545n, feeRate: 2 })).toThrow();
    expect(() => memoScript("x".repeat(81))).toThrow();
    expect(() => buildAndSignUtxoSend({ family: "DOGE", privateKey: key("DOGE"), utxos, to: "DRbFs1GDf9F3MGnHy24vPP8h7wCE8nCBAU", amount: 5_200_000_000n, feeRate: 1000 })).toThrow();
  });
  test("XRP payment with memo", () => {
    const r = signXrpPayment({ privateKey: key("XRP"), to: "rMTwKkK2MjLkFGb6NSnMqcyaNoTvuiZhzs", drops: 12_345_678n, feeDrops: 12n, sequence: 7, lastLedgerSequence: 90_000_000, memo: MEMO });
    expect(r.hash).toBe("2521690A5AF8158B26F505B2414D160D2D066820DF3A16CE66F0479873F5D90C");
    expect(() => signXrpPayment({ privateKey: key("XRP"), to: "rMTwKkK2MjLkFGb6NSnMqcyaNoTvuiZhzs", drops: 1n, feeDrops: 2_000_000n, sequence: 1, lastLedgerSequence: 1 })).toThrow();
  });
  test("TRON transfer signature matches TronWeb", () => {
    const r = signTronTransfer({ privateKey: key("TRX"), to: "TGeDLmuvGeJFV6Vc9ggnwX96mHR19avogD", sun: 1_500_000n, refBlockNum: 77_000_123, refBlockId: "0000000004970d3b" + "11".repeat(24), timestamp: 1763390000000, memo: MEMO });
    expect(r.signature).toBe("f9541975002bd25e6f0645bec92d94ead2556eff076ab7558ad34c91de235d5670f66f26a0b1811a8a3a6e30e730a8707be77a9e1d43759707068c31336a16ba1b");
    expect(r.from).toBe("TGeDLmuvGeJFV6Vc9ggnwX96mHR19avogD");
  });
  test("Solana transfer + memo", () => {
    const r = signSolTransfer({ privateKey: key("SOL"), to: "4jUDa9gFRtwua6GDHhfnLRZRv7XZr1dLexxEbQ6VeR3M", lamports: 25_000_000n, recentBlockhash: "EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k", memo: MEMO });
    expect(r.signature).toBe("7EyZJiCSVfFZAAppasnXxa1N4beRb2T8gtcWhLWP2kDsEbjPzSZG7CWJ7cjUniaarBdR7JeVyBEnF7mXmQs65hg");
    expect(() => signSolTransfer({ privateKey: key("SOL"), to: b.addresses.SOL!, lamports: 1n, recentBlockhash: "EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k" })).toThrow();
  });
});
