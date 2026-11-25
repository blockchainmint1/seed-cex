import { describe, expect, test } from "bun:test";
import { chainMinimum, ethToHandOn, hopFor, secondHopOk } from "./rules";

describe("hype chain rules", () => {
  test("TSD goes through the TSD route, other coins through THORChain/Maya, ETH is a plain Relay swap", () => {
    expect(hopFor({ kind: "tsd" })).toBe("tsd");
    expect(hopFor({ kind: "coin", id: "BTC" })).toBe("xchain");
    expect(hopFor({ kind: "coin", id: "ETH" })).toBeNull();
  });
  test("hands on only ETH that arrived, less the fee", () => {
    // pocket had 1 ETH before; 0.5 reported, 0.5 arrived; fee 0.01
    expect(ethToHandOn(500n, 1500n, 1000n, 10n)).toBe(490n);
    // reported more than arrived: arrived wins, member's own ETH untouched
    expect(ethToHandOn(800n, 1500n, 1000n, 10n)).toBe(490n);
    expect(ethToHandOn(500n, 900n, 1000n, 10n)).toBeNull();
    expect(ethToHandOn(5n, 1500n, 1000n, 10n)).toBeNull();
    expect(ethToHandOn(500n, 1500n, null, 10n)).toBeNull();
  });
  test("second hop needs the agreed minimum", () => {
    expect(chainMinimum(100, 100)).toBe(99);
    expect(secondHopOk(99, 99)).toBe(true);
    expect(secondHopOk(98.9, 99)).toBe(false);
  });
});

import { tonToHandOn as tonHand, chainSteps as steps3, relayLegDirection as rld, chainEndSymbol as endSym } from "./rules";
describe("TSD → USD₮ on TON in one tap", () => {
  test("three steps, Relay step pays TON", () => {
    expect(steps3("to_ton_usdt", "tsd", "TSD")).toEqual(["Telegram tap", "TSD Bridge: TSD → ETH", "Relay: ETH → TON", "STON.fi: TON → USD₮ on TON"]);
    expect(rld("to_ton_usdt")).toBe("to_ton");
    expect(endSym("to_ton_usdt")).toBe("USD₮ on TON");
  });
  test("step 3 swaps only TON that arrived, less 0.265 TON for its fees", () => {
    // held 5 TON before, Relay reported 10, pocket now 15 → 10 − 0.265 = 9.735 TON
    expect(tonHand(10_000_000_000n, 15_000_000_000n, 5_000_000_000n)).toBe(9_735_000_000n);
    // only 3 arrived though Relay reported 10 → 3 − 0.265
    expect(tonHand(10_000_000_000n, 8_000_000_000n, 5_000_000_000n)).toBe(2_735_000_000n);
    // the member's own 5 TON is never spent
    expect(tonHand(10_000_000_000n, 5_000_000_000n, 5_000_000_000n)).toBeNull();
    // under 0.1 TON left after fees → nothing
    expect(tonHand(300_000_000n, 5_300_000_000n, 5_000_000_000n)).toBeNull();
  });
});

import { chainStatusLabel as _csl } from "./rules";
describe("chainStatusLabel (audit TC4)", () => {
  test("three-step chain stopped after TON arrived says TON", () => { expect(_csl("kept_mid", "to_ton_usdt", true)).toBe("Stopped — TON in your pocket"); });
  test("stopped before TON arrived still says ETH", () => { expect(_csl("kept_mid", "to_ton_usdt", false)).toBe("Stopped — ETH in your pocket"); });
});
