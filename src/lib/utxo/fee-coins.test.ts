import { describe, expect, test } from "bun:test";
import { parseUnsignedTx } from "@/lib/lock/script";
import { bytesToHex } from "@noble/hashes/utils.js";
import { FEE_COIN_SATS, addFeeCoins, feeCoinPlan, omniSendMismatch, spareFeeCoins } from "./fee-coins";

// Unsigned copy of Mati's TSD payment, built by Seeds' TEXITcoin node (19.999 TSD → seller).
const RAW = "02000000018884b12d22b05694c01aec342b8fb4e87ffb808c3a3e50b35de57076fc1f791c0000000000ffffffff0398c87648170000001976a914e468cdbd1176d17e89de29d6d4cc9072e970619f88ac0000000000000000166a146f6d6e6900000000000000270000000077340d6054150000000000001976a914da11e12bb50752d4d374ccb97a9159126cc2f84788ac00000000";
const MATI = "76a914e468cdbd1176d17e89de29d6d4cc9072e970619f88ac";
const SELLER = "76a914da11e12bb50752d4d374ccb97a9159126cc2f84788ac";
const FROM = "Tv8XbnrDnjSmhjGr5ViUCfiKtrttmKJ9tz";
const TO = "TuBriHG1dFS3h55GVGHE5ajMWVDyW2kHgE";

describe("fee coins on TSD payments", () => {
  test("a pocket with no small coins gets 5 coins of 0.01 TXC, paying 34 bytes each at the fee rate", () => {
    expect(feeCoinPlan({ spare: 0, changeSats: 99_999_997_420, feeRate: 10 })).toEqual({ pieces: 5, extraFeeSats: 1700 });
  });
  test("a pocket that still has 2 fee coins gets none", () => {
    expect(feeCoinPlan({ spare: 2, changeSats: 99_999_997_420, feeRate: 10 }).pieces).toBe(0);
  });
  test("one spare coin left → tops up to 5 (4 new)", () => {
    expect(feeCoinPlan({ spare: 1, changeSats: 10e8, feeRate: 10 }).pieces).toBe(4);
  });
  test("small change only makes as many as it can while keeping 0.01 TXC as change", () => {
    expect(feeCoinPlan({ spare: 0, changeSats: 3_100_000, feeRate: 10 }).pieces).toBe(2);
    expect(feeCoinPlan({ spare: 0, changeSats: 1_500_000, feeRate: 10 }).pieces).toBe(0);
  });
  test("spare fee coins: 0.05 TXC or less, big enough to pay a fee, not being spent now", () => {
    const coins = [
      { txid: "a", vout: 0, amount: 0.01 },
      { txid: "b", vout: 0, amount: 0.05 },
      { txid: "c", vout: 0, amount: 0.06 },
      { txid: "d", vout: 0, amount: 0.0001 },
      { txid: "e", vout: 0, amount: 1000 },
    ];
    expect(spareFeeCoins(coins, [{ txid: "a", vout: 0 }], 12_580)).toBe(1);
  });
  test("Mati's payment: 5 fee coins come out of his change; the TSD message and the seller stay last, unchanged", () => {
    const before = parseUnsignedTx(RAW);
    const after = parseUnsignedTx(addFeeCoins(RAW, MATI, 5, 1700));
    expect(after.inputs).toEqual(before.inputs);
    expect(after.outputs).toHaveLength(8);
    for (let k = 0; k < 5; k++) {
      expect(after.outputs[k]!.value).toBe(BigInt(FEE_COIN_SATS));
      expect(bytesToHex(after.outputs[k]!.script)).toBe(MATI);
    }
    expect(after.outputs[5]!.value).toBe(before.outputs[0]!.value - BigInt(5 * FEE_COIN_SATS + 1700));
    expect(after.outputs[6]).toEqual(before.outputs[1]!);
    expect(after.outputs[7]).toEqual(before.outputs[2]!);
    expect(bytesToHex(after.outputs[7]!.script)).toBe(SELLER);
    const total = (t: typeof before) => t.outputs.reduce((s, o) => s + o.value, 0n);
    expect(total(before) - total(after)).toBe(1700n);
  });
  test("refuses when there isn't exactly one change output back to the pocket", () => {
    expect(() => addFeeCoins(RAW, "76a914" + "00".repeat(20) + "88ac", 5, 1700)).toThrow();
    expect(() => addFeeCoins(RAW, SELLER, 5, 1700)).toThrow(); // the recipient is last: never treated as change
  });
  test("node read-back: only the same plain TSD send from this pocket to this recipient passes", () => {
    const ok = { type_int: 0, sendingaddress: FROM, referenceaddress: TO, propertyid: 39, amount: "19.99900000" };
    const want = { from: FROM, to: TO, propertyId: 39, amount: 19.999 };
    expect(omniSendMismatch(ok, want)).toBeNull();
    expect(omniSendMismatch({ ...ok, referenceaddress: FROM }, want)).toBe("it would go to a different address");
    expect(omniSendMismatch({ ...ok, amount: "19.998" }, want)).toBe("it would send a different amount");
    expect(omniSendMismatch({ ...ok, propertyid: 1 }, want)).toBe("it would send a different token");
    expect(omniSendMismatch({ ...ok, type_int: 4 }, want)).toBe("it isn't a plain token send");
    expect(omniSendMismatch(null, want)).toBe("the node couldn't read the payment back");
  });
});
