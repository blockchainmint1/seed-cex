import { describe, expect, test } from "bun:test";
import { firstHopOk, isTwoStepTerminal, midToHandOn, secondHopOk, twoStepIndex } from "./rules";

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
