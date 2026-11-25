import { describe, expect, test } from "bun:test";
import { stonMinimum, tonSwapUsd } from "./rules";
import { swapMinimum } from "@/lib/pockets/ton-jetton";

describe("STON.fi swap minimum (audit TA2)", () => {
  test("a tampered shown value of 1 still signs 99% of Seeds' fresh quote", () => {
    expect(stonMinimum(1n, 4_590_000n)).toBe(swapMinimum(4_590_000n));
    expect(stonMinimum(1n, 4_590_000n)).toBeGreaterThan(4_500_000n);
  });
  test("an honest shown value equal to the fresh quote signs 99% of it", () => expect(stonMinimum(4_590_000n, 4_590_000n)).toBe(swapMinimum(4_590_000n)));
  test("a price that dropped more than 1% since shown is refused", () => expect(() => stonMinimum(4_590_000n, 4_500_000n)).toThrow(/moved more than 1%/));
  test("a small dip within 1% keeps the member's own 99% floor", () => expect(stonMinimum(4_590_000n, 4_560_000n)).toBe(swapMinimum(4_590_000n)));
  test("zero quotes are refused", () => expect(() => stonMinimum(4_590_000n, 0n)).toThrow());
});

describe("TON swap dollar value (audit TA3)", () => {
  test("prices the offer", () => expect(tonSwapUsd(5_000_000_000n, 1.8)).toBe(9));
  test("no price means no swap", () => { expect(tonSwapUsd(5_000_000_000n, null)).toBeNull(); expect(tonSwapUsd(5_000_000_000n, 0)).toBeNull(); });
});

import { usdtFeeAllowance, USDT_SEND_TON_NEED } from "@/lib/pockets/ton-jetton";
describe("USD₮-on-TON send needs enough TON up front (audit TA4)", () => {
  test("0.02 TON is refused before any code or tap", () => expect(usdtFeeAllowance(20_000_000n)).toBe(0n));
  test("exactly the need passes", () => expect(usdtFeeAllowance(USDT_SEND_TON_NEED)).toBeGreaterThan(0n));
  test("the need is 0.13 TON", () => expect(USDT_SEND_TON_NEED).toBe(130_000_000n));
});
