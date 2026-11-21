import { describe, expect, test } from "bun:test";
import { EXPLORER_BASE, MAX_COINS_TO_VERIFY, checkCoinsAgainstNode, fastListShort, indexerUsableForSend, parseExplorerUtxos, parseIndexedTip } from "./explorer-rules";

const tx = "a".repeat(64);
const conf = (value: number, vout = 0) => ({ txid: tx, vout, value, status: { confirmed: true, block_height: 133096 } });

describe("TXC/ISK explorer coins", () => {
  test("ISK reads from mempool.iskandercoin.com, TXC from mempool.texitcoin.org", () => {
    expect(EXPLORER_BASE.isk).toBe("https://mempool.iskandercoin.com");
    expect(EXPLORER_BASE.txc).toBe("https://mempool.texitcoin.org");
  });
  test("100 ISK in satoshis reads as 100 coins with its block height", () => {
    const [c] = parseExplorerUtxos([conf(10_000_000_000)], "76a9");
    expect(c.amount).toBe(100);
    expect(c.height).toBe(133096);
    expect(c.scriptPubKey).toBe("76a9");
  });
  test("unconfirmed coins are left out, like the node's scan", () => {
    const rows = [conf(5e8), { txid: tx, vout: 1, value: 7e8, status: { confirmed: false } }];
    expect(parseExplorerUtxos(rows, "s").reduce((s, c) => s + c.amount, 0)).toBe(5);
  });
  test("a malformed coin rejects the whole reply instead of showing a wrong balance", () => {
    expect(() => parseExplorerUtxos([conf(1e8), { txid: "zz", vout: 0, value: 1 }], "s")).toThrow();
    expect(() => parseExplorerUtxos([{ ...conf(1e8), value: "100" }], "s")).toThrow();
    expect(() => parseExplorerUtxos({ error: "x" }, "s")).toThrow();
  });
});

describe("TXC indexer for sends", () => {
  test("usable when it has indexed our node's tip and the list is complete", () => {
    expect(indexerUsableForSend({ indexedTip: 386226, nodeTip: 386226, truncated: false })).toBe(true);
  });
  test("one block behind our node: use the node instead", () => {
    expect(indexerUsableForSend({ indexedTip: 386225, nodeTip: 386226, truncated: false })).toBe(false);
  });
  test("a cut-off coin list is never used for a send", () => {
    expect(indexerUsableForSend({ indexedTip: 386226, nodeTip: 386226, truncated: true })).toBe(false);
  });
  test("unknown tip on either side: use the node", () => {
    expect(indexerUsableForSend({ indexedTip: null, nodeTip: 386226, truncated: false })).toBe(false);
    expect(indexerUsableForSend({ indexedTip: 386226, nodeTip: null, truncated: false })).toBe(false);
  });
  test("status reply parses only a real, ok height", () => {
    expect(parseIndexedTip({ ok: true, indexed_tip: 386226 })).toBe(386226);
    expect(parseIndexedTip({ ok: false, indexed_tip: 386226 })).toBe(null);
    expect(parseIndexedTip({ ok: true, indexed_tip: "386226" })).toBe(null);
    expect(parseIndexedTip(null)).toBe(null);
  });
});

describe("double-checking indexer coins with our node (auditor, Nov 21)", () => {
  const coin = (amount: number, vout = 0) => ({ txid: tx, vout, scriptPubKey: "76a9aa88ac", amount, height: 1 });
  const node = (value: number, hex = "76a9aa88ac", confirmations = 3) => ({ value, confirmations, scriptPubKey: { hex } });

  test("coins that match our node exactly are kept", () => {
    const r = checkCoinsAgainstNode([coin(100), coin(2.5, 1)], [node(100), node(2.5)]);
    expect(r).toEqual({ kind: "ok", coins: [coin(100), coin(2.5, 1)] });
  });
  test("indexer says 1 TXC, our node says 100 TXC: the whole list is refused", () => {
    expect(checkCoinsAgainstNode([coin(1)], [node(100)]).kind).toBe("mismatch");
  });
  test("a one-satoshi difference is a mismatch", () => {
    expect(checkCoinsAgainstNode([coin(1)], [node(1.00000001)]).kind).toBe("mismatch");
  });
  test("a coin belonging to another address on our node is a mismatch", () => {
    expect(checkCoinsAgainstNode([coin(5)], [node(5, "76a9bb88ac")]).kind).toBe("mismatch");
  });
  test("spent, unknown or unconfirmed coins are dropped, lowering the balance only", () => {
    const r = checkCoinsAgainstNode([coin(5), coin(7, 1), coin(9, 2)], [null, node(7, undefined, 0), node(9)]);
    expect(r).toEqual({ kind: "ok", coins: [coin(9, 2)] });
  });
  test("our node failing on any coin means use the slow full check", () => {
    expect(checkCoinsAgainstNode([coin(5)], [new Error("timeout")]).kind).toBe("unknown");
    expect(checkCoinsAgainstNode([coin(5), coin(6, 1)], [node(5)]).kind).toBe("unknown");
  });
  test("pockets with more than 500 coins go straight to the slow full check", () => {
    expect(MAX_COINS_TO_VERIFY).toBe(500);
  });
});

describe("rechecking before 'not enough coins'", () => {
  test("fast list holds 9.99 but the send needs 10: recheck the slow way", () => {
    expect(fastListShort([{ amount: 9.99 }], 10)).toBe(true);
  });
  test("fast list covers the send: no recheck", () => {
    expect(fastListShort([{ amount: 6 }, { amount: 4 }], 10)).toBe(false);
  });
  test("no amount given (a plain balance read): no recheck", () => {
    expect(fastListShort([], undefined)).toBe(false);
    expect(fastListShort([], 0)).toBe(false);
  });
});
