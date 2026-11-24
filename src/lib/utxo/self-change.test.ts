import { describe, expect, test } from "bun:test";
import { checkCoinsAgainstNode, mergeCoins, p2pkhHashOf, selfChangeCoins, type NodeTx } from "./explorer-rules";
import { pickCarrierCoins } from "./carrier-coins";

// Mati's real TSD payment (TXC tx 1db5fa0e…, Nov 23 2026), as our node decodes it.
const MATI_SCRIPT = "76a914e468cdbd1176d17e89de29d6d4cc9072e970619f88ac";
const SELLER_SCRIPT = "76a914da11e12bb50752d4d374ccb97a9159126cc2f84788ac";
const MATI_SIG =
  "304402206b2266f3290fba5a9956104e0e4479127c439e95016215ab056c2f42218cfa1902200d040ba1844fad5f43dae8993c7351d172f9561c1dfc5ecba95a318ca960718b[ALL] 020bd4cab0bae5ac920ee57a4cca453b550a5ddfe164ca02a67f8b08bb653e0809";
const OTHER_SIG =
  "304402206b2266f3290fba5a9956104e0e4479127c439e95016215ab056c2f42218cfa1902200d040ba1844fad5f43dae8993c7351d172f9561c1dfc5ecba95a318ca960718b[ALL] 03" + "11".repeat(32);
const TXID = "1db5fa0e677ae607a1b2a921be000c65228ffc3f081bf69f14e90c48ecb489f5";

const matiTx = (vin: NodeTx["vin"] = [{ ismweb: false, scriptSig: { asm: MATI_SIG } }]): NodeTx => ({
  txid: TXID,
  vin,
  vout: [
    { n: 0, value: 999.9999196, ismweb: false, scriptPubKey: { hex: MATI_SCRIPT } },
    { n: 1, value: 0, scriptPubKey: { hex: "6a146f6d6e6900000000000000270000000077340d60" } },
    { n: 2, value: 0.0000546, scriptPubKey: { hex: SELLER_SCRIPT } },
  ],
});

describe("a pocket's own change counts while it waits for a block", () => {
  test("Mati's 999.9999196 TXC change counts for his pocket", () => {
    const coins = selfChangeCoins([matiTx()], MATI_SCRIPT);
    expect(coins).toEqual([{ txid: TXID, vout: 0, scriptPubKey: MATI_SCRIPT, amount: 999.9999196, height: 0 }]);
  });
  test("the seller's 0.0000546 TXC from the same payment does not count for the seller (someone else signed it)", () => {
    expect(selfChangeCoins([matiTx()], SELLER_SCRIPT)).toEqual([]);
  });
  test("one input signed by a different key → nothing counts", () => {
    const tx = matiTx([{ scriptSig: { asm: MATI_SIG } }, { scriptSig: { asm: OTHER_SIG } }]);
    expect(selfChangeCoins([tx], MATI_SCRIPT)).toEqual([]);
  });
  test("MWEB inputs, mined coins and inputs we can't read → nothing counts", () => {
    expect(selfChangeCoins([matiTx([{ ismweb: true, scriptSig: { asm: MATI_SIG } }])], MATI_SCRIPT)).toEqual([]);
    expect(selfChangeCoins([matiTx([{ coinbase: "03abcd" }])], MATI_SCRIPT)).toEqual([]);
    expect(selfChangeCoins([matiTx([{ scriptSig: {} }])], MATI_SCRIPT)).toEqual([]);
    expect(selfChangeCoins([matiTx([])], MATI_SCRIPT)).toEqual([]);
  });
  test("only plain pay-to-address scripts are understood", () => {
    expect(p2pkhHashOf(MATI_SCRIPT)).toBe("e468cdbd1176d17e89de29d6d4cc9072e970619f");
    expect(p2pkhHashOf("a914e468cdbd1176d17e89de29d6d4cc9072e970619f87")).toBeNull();
    expect(selfChangeCoins([matiTx()], "a914e468cdbd1176d17e89de29d6d4cc9072e970619f87")).toEqual([]);
  });
  test("our node must still show the change unspent at that size; other coins still need a block", () => {
    const coin = { txid: TXID, vout: 0, scriptPubKey: MATI_SCRIPT, amount: 999.9999196 };
    const waiting = { value: 999.9999196, confirmations: 0, scriptPubKey: { hex: MATI_SCRIPT } };
    expect(checkCoinsAgainstNode([coin], [waiting], { unconfirmedOk: true })).toEqual({ kind: "ok", coins: [coin] });
    expect(checkCoinsAgainstNode([coin], [waiting])).toEqual({ kind: "ok", coins: [] });
    expect(checkCoinsAgainstNode([coin], [null], { unconfirmedOk: true })).toEqual({ kind: "ok", coins: [] });
    expect(checkCoinsAgainstNode([coin], [{ ...waiting, value: 1 }], { unconfirmedOk: true }).kind).toBe("mismatch");
  });
  test("a coin already in the list is never counted twice", () => {
    const a = { txid: TXID, vout: 0, amount: 1 };
    const b = { txid: TXID.toUpperCase(), vout: 0, amount: 1 };
    const c = { txid: TXID, vout: 2, amount: 1 };
    expect(mergeCoins([a], [b, c])).toEqual([a, c]);
  });
});

describe("TSD payment fee coin", () => {
  const fee = (n: number) => (n * 148 + 110) * 10; // 2,580 sats for one input
  const margin = 10_000;
  test("uses the smallest coin that covers the fee, leaving the 1,000 TXC coin alone", () => {
    const coins = [{ amount: 1000, height: 5 }, { amount: 0.5, height: 5 }, { amount: 0.01, height: 5 }];
    const p = pickCarrierCoins(coins, fee, margin);
    expect(p.chosen).toEqual([{ amount: 0.01, height: 5 }]);
    expect(p.feeSats).toBe(2580);
  });
  test("a confirmed coin is preferred over change still waiting for a block", () => {
    const p = pickCarrierCoins([{ amount: 0.01, height: 0 }, { amount: 5, height: 9 }], fee, margin);
    expect(p.chosen).toEqual([{ amount: 5, height: 9 }]);
  });
  test("Mati's pocket (1,000 TXC + 0.0001 TXC dust): the 1,000 coin is the only one that can pay", () => {
    const p = pickCarrierCoins([{ amount: 0.0001, height: 5 }, { amount: 1000, height: 5 }], fee, margin);
    expect(p.chosen).toEqual([{ amount: 1000, height: 5 }]);
    expect(p.enough).toBe(true);
  });
  test("when no single coin covers it, coins are added biggest first; too little is reported", () => {
    const p = pickCarrierCoins([{ amount: 0.00005 }, { amount: 0.0001 }], fee, margin);
    expect(p.chosen.map((c) => c.amount)).toEqual([0.0001, 0.00005]);
    expect(p.enough).toBe(true);
    expect(pickCarrierCoins([{ amount: 0.00001 }], fee, margin).enough).toBe(false);
  });
});
