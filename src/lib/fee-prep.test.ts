import { describe, expect, test } from "bun:test";
import { BASE_FROM_TSD, baseAction, ethereumAction, FEE_PREP, feeLevel, swapsCovered } from "./fee-prep";

describe("network fee step of the setup guide", () => {
  test("suggests about $10 of ETH on Ethereum and $1 on Base", () => {
    expect(FEE_PREP.ethereum.suggestUsd).toBe(10);
    expect(FEE_PREP.base.suggestUsd).toBe(1);
  });
  test("the guide's conversion is 10 TSD, TSD Bridge's smallest order", () => {
    expect(FEE_PREP.convertTsd).toBe(10);
  });
  test("an empty pocket is empty, a few dollars is enough, a few cents is low", () => {
    expect(feeLevel(0, 3000, 2)).toBe("empty");
    expect(feeLevel(0.001, 3000, 2)).toBe("enough"); // $3
    expect(feeLevel(0.0001, 3000, 2)).toBe("low"); // $0.30
    expect(feeLevel(0.0001, 3000, 0.25)).toBe("enough"); // $0.30 on Base
  });
  test("an unreadable balance or price is never called enough", () => {
    expect(feeLevel(null, 3000, 2)).toBe("unknown");
    expect(feeLevel(0.01, null, 2)).toBe("unknown");
  });
  test("enough ETH means nothing to do", () => {
    expect(ethereumAction({ level: "enough", convertBlocker: null, firstFeePaid: true })).toBe("none");
    expect(baseAction("enough")).toBe("none");
  });
  test("converting TSD is offered only when the conversion can run and its own fee is paid", () => {
    expect(ethereumAction({ level: "low", convertBlocker: null, firstFeePaid: true })).toBe("convert");
    expect(ethereumAction({ level: "empty", convertBlocker: null, firstFeePaid: false })).toBe("send_in");
    expect(ethereumAction({ level: "empty", convertBlocker: "TSD swaps are in a small test", firstFeePaid: true })).toBe("send_in");
  });
  test("Base fee money is sent in until Seeds can swap TSD into ETH on Base", () => {
    expect(BASE_FROM_TSD).toBe(false);
    expect(baseAction("empty")).toBe("send_in");
    expect(baseAction("empty", true)).toBe("convert");
  });
  test("counts whole swaps a balance pays for", () => {
    expect(swapsCovered(0.01, 0.00007)).toBe(142);
    expect(swapsCovered(null, 0.00007)).toBeNull();
    expect(swapsCovered(0.01, 0)).toBeNull();
  });
});
