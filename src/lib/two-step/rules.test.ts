import { describe, expect, test } from "bun:test";
import { HOP_WAIT_MINUTES, TWO_STEP_TESTERS_ONLY, stopForMissingMid, firstHopOk, isTwoStepTerminal, midToHandOn, secondHopOk, twoStepIndex } from "./rules";

describe("two-step swap rules", () => {
  test("first hop goes ahead within 2% of the shown price, not past it", () => {
    expect(firstHopOk(100, 98)).toBe(true);
    expect(firstHopOk(100, 97.9)).toBe(false);
    expect(firstHopOk(0, 50)).toBe(false);
  });
  test("second hop needs the fresh price to clear the agreed minimum", () => {
    expect(secondHopOk(99, 99)).toBe(true);
    expect(secondHopOk(98.99, 99)).toBe(false);
    expect(secondHopOk(100, 0)).toBe(false);
  });
  test("never hands on more than the pocket holds, and nothing when unreadable", () => {
    expect(midToHandOn(10, 9.5)).toBe(9.5);
    expect(midToHandOn(10, 12)).toBe(10);
    expect(midToHandOn(10, null)).toBeNull();
    expect(midToHandOn(null, 12)).toBeNull();
  });
  test("finished swaps stay finished; progress counts the steps", () => {
    expect(isTwoStepTerminal("kept_mid")).toBe(true);
    expect(isTwoStepTerminal("leg2")).toBe(false);
    expect(twoStepIndex("leg2")).toBe(2);
    expect(twoStepIndex("done")).toBe(3);
  });
});

describe("audit T4: step 2 only hands on what step 1 brought in", () => {
  test("coins already in the pocket are never handed on", () => {
    // Pocket held 3 ETH before step 1; step 1 should pay 1 ETH but only 0.4 has arrived.
    expect(midToHandOn(1, 3.4, 3)).toBeCloseTo(0.4, 12);
    // Paid in full: hand on exactly the reported payout, not the 3 ETH already there.
    expect(midToHandOn(1, 4, 3)).toBe(1);
  });
  test("nothing arrived yet (or the member spent some) means wait, never dip into old coins", () => {
    expect(midToHandOn(1, 3, 3)).toBeNull();
    expect(midToHandOn(1, 2.5, 3)).toBeNull();
  });
  test("older swaps without a starting balance keep the balance cap", () => {
    expect(midToHandOn(10, 9.5, null)).toBe(9.5);
  });
});

describe("audit T2: two-step swaps stay testers-only", () => {
  test("must stay on until each step checks the member's own caps", () => {
    // Inner steps skip per-swap caps (held once by reserve_two_step_swap). Opening two-step
    // swaps to capped members needs that change first; see TWO_STEP_TESTERS_ONLY in rules.ts.
    expect(TWO_STEP_TESTERS_ONLY).toBe(true);
  });
});

describe("re-check: step 2 never waits forever when the middle coin was spent", () => {
  test("stops (coin kept) only after the wait and a second empty check", () => {
    expect(stopForMissingMid(HOP_WAIT_MINUTES + 1, true, true)).toBe(true);
    expect(stopForMissingMid(HOP_WAIT_MINUTES + 1, false, true)).toBe(false);
    expect(stopForMissingMid(HOP_WAIT_MINUTES - 1, true, true)).toBe(false);
    expect(stopForMissingMid(HOP_WAIT_MINUTES + 1, true, false)).toBe(false);
  });
});
