import { describe, expect, test } from "bun:test";
import { alchemyDeposits, esploraDeposit, isOmniCarrier, omniDeposit, seedsLabel, watchedDeposit, type EsploraTx } from "./deposit-rules";

const ME = "TMeAddress1";

describe("deposit rules", () => {
  test("coins paid into the pocket from elsewhere are a deposit", () => {
    const tx: EsploraTx = { txid: "a", vin: [{ prevout: { scriptpubkey_address: "TOther", value: 9e8 } }], vout: [{ scriptpubkey_address: ME, value: 150000000 }, { scriptpubkey_address: "TOther", value: 1 }], status: { confirmed: true, block_time: 1795000000 } };
    expect(esploraDeposit(tx, ME, "TXC")).toEqual({ txid: "a", coin: "TXC", amount: 1.5, blockTime: new Date(1795000000 * 1000).toISOString(), from: "TOther" });
  });

  test("the pocket's own send (and its change) is not a deposit; unconfirmed waits", () => {
    const own: EsploraTx = { txid: "b", vin: [{ prevout: { scriptpubkey_address: ME, value: 5e8 } }], vout: [{ scriptpubkey_address: ME, value: 4e8 }], status: { confirmed: true } };
    expect(esploraDeposit(own, ME, "TXC")).toBeNull();
    const pending: EsploraTx = { txid: "c", vin: [], vout: [{ scriptpubkey_address: ME, value: 1e8 }], status: { confirmed: false } };
    expect(esploraDeposit(pending, ME, "TXC")).toBeNull();
  });

  test("Omni sends of TSD to the pocket count; other tokens and invalid sends don't", () => {
    expect(isOmniCarrier({ txid: "d", vout: [{ scriptpubkey: "6a146f6d6e6900000000000000270000000005f5e100", scriptpubkey_type: "op_return", value: 0 }] })).toBe(true);
    const ok = { txid: "d", valid: true, type_int: 0, sendingaddress: "TOther", referenceaddress: ME, propertyid: 39, amount: "25.00000000", blocktime: 1795000000, confirmations: 3 };
    expect(omniDeposit(ok, ME, { 39: "TSD" })?.amount).toBe(25);
    expect(omniDeposit({ ...ok, valid: false }, ME, { 39: "TSD" })).toBeNull();
    expect(omniDeposit({ ...ok, propertyid: 40 }, ME, { 39: "TSD" })).toBeNull();
    expect(omniDeposit({ ...ok, sendingaddress: ME }, ME, { 39: "TSD" })).toBeNull();
  });

  test("only listed tokens count on EVM networks — airdropped look-alikes never show", () => {
    const usdc = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const me = "0xAbC0000000000000000000000000000000000001";
    const list = [
      { hash: "0x1", from: "0xff", to: me.toLowerCase(), category: "erc20", rawContract: { address: usdc, value: "0x989680" }, metadata: { blockTimestamp: "2026-11-01T00:00:00Z" } },
      { hash: "0x2", from: "0xff", to: me, category: "erc20", rawContract: { address: "0xdead", value: "0x1" } },
      { hash: "0x3", from: "0xff", to: me, category: "external", value: 0.25 },
      { hash: "0x4", from: me, to: me, category: "external", value: 1 },
    ];
    const got = alchemyDeposits(list, me, { native: "ETH", tokens: { [usdc]: { symbol: "USDC", decimals: 6 } } });
    expect(got.map((d) => [d.txid, d.coin, d.amount])).toEqual([["0x1", "USDC", 10], ["0x3", "ETH", 0.25]]);
  });

  test("a balance rise counts only beyond what Seeds' own swaps delivered", () => {
    expect(watchedDeposit(null, 5, 0)).toBeNull();
    expect(watchedDeposit(1, 0.5, 0)).toBeNull();
    expect(watchedDeposit(1, 3, 0)).toBe(2);
    expect(watchedDeposit(1, 3, 2)).toBeNull();
    expect(watchedDeposit(1, 3, 1.5)).toBe(0.5);
  });

  test("Seeds-made transactions are labelled", () => {
    expect(seedsLabel("ABC", { abc: "Seeds swap" })).toBe("Seeds swap");
    expect(seedsLabel("def", { abc: "Seeds swap" })).toBeNull();
  });
});
