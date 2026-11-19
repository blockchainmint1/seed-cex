import { describe, expect, test } from "bun:test";
import { EXPLORER_BASE, parseExplorerUtxos } from "./explorer-rules";

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
