import { describe, expect, test } from "bun:test";
import { EXPLORER_BASE, indexerUsableForSend, parseExplorerUtxos, parseIndexedTip } from "./explorer-rules";

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
