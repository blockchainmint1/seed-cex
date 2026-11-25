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
