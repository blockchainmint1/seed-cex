import { describe, expect, test } from "bun:test";
import {
  clampSlippagePct,
  estimateMarketFill,
  marketFinalStatus,
  marketOrderNotes,
  protectionPrice,
  withoutOwnOrders,
} from "./market-order";

const asks = [
  { price: 0.052, amount: 500 },
  { price: 0.05, amount: 1000 },
  { price: 0.06, amount: 5000 },
];
const bids = [
  { price: 0.048, amount: 300 },
  { price: 0.049, amount: 200 },
];

describe("price protection", () => {
  test("buy may pay up to 2% over the best price by default", () => {
    expect(protectionPrice("buy", 0.05, 2)).toBe(0.051);
  });
  test("sell accepts down to 5% under the best price", () => {
    expect(protectionPrice("sell", 0.049, 5)).toBeCloseTo(0.04655, 8);
  });
  test("protection is capped at 10% and falls back to 2% on bad input", () => {
    expect(clampSlippagePct(50)).toBe(10);
    expect(clampSlippagePct(-1)).toBe(2);
    expect(clampSlippagePct("abc")).toBe(2);
  });
});

describe("walking the book", () => {
  test("a small buy fills at the single best price", () => {
    const e = estimateMarketFill("buy", asks, 400, 2);
    expect(e.filled).toBe(400);
    expect(e.total).toBe(20);
    expect(e.avgPrice).toBe(0.05);
    expect(e.unfilled).toBe(0);
  });
  test("a buy stops at the protection price and the rest is cancelled", () => {
    // 2% over 0.05 = 0.051, so the 0.052 seller is out of reach.
    const e = estimateMarketFill("buy", asks, 1200, 2);
    expect(e.filled).toBe(1000);
    expect(e.unfilled).toBe(200);
  });
  test("with 5% protection the buy reaches the second seller", () => {
    const e = estimateMarketFill("buy", asks, 1200, 5);
    expect(e.filled).toBe(1200);
    expect(e.total).toBeCloseTo(1000 * 0.05 + 200 * 0.052, 8);
    expect(e.levelsUsed).toBe(2);
  });
  test("a sell takes the highest bids first", () => {
    const e = estimateMarketFill("sell", bids, 300, 5);
    expect(e.bestPrice).toBe(0.049);
    expect(e.total).toBeCloseTo(200 * 0.049 + 100 * 0.048, 8);
  });
  test("the member's own resting orders are left out", () => {
    const left = withoutOwnOrders(asks, [{ price: 0.05, remaining: 1000 }]);
    const e = estimateMarketFill("buy", left, 100, 2);
    expect(e.bestPrice).toBe(0.052);
  });
});

describe("heads-up notes", () => {
  test("an empty book cannot place a market order", () => {
    const r = marketOrderNotes(estimateMarketFill("buy", [], 10), { base: "TXC", quote: "TSD" });
    expect(r.canPlace).toBe(false);
  });
  test("a part fill warns that the rest is cancelled", () => {
    const r = marketOrderNotes(estimateMarketFill("buy", asks, 1200, 2), { base: "TXC", quote: "TSD" });
    expect(r.canPlace).toBe(true);
    expect(r.notes.some((n) => n.text.includes("cancelled"))).toBe(true);
  });
  test("paying 5% or more over the outside price is flagged", () => {
    const e = estimateMarketFill("buy", asks, 100, 2);
    const r = marketOrderNotes(e, { base: "TXC", quote: "TSD", refPrice: 0.047 });
    expect(r.notes.some((n) => n.text.includes("outside market price"))).toBe(true);
    const ok = marketOrderNotes(e, { base: "TXC", quote: "TSD", refPrice: 0.0495 });
    expect(ok.notes.some((n) => n.text.includes("outside market price"))).toBe(false);
  });
});

test("a market order ends filled or cancelled, never open", () => {
  expect(marketFinalStatus(100, 100)).toBe("filled");
  expect(marketFinalStatus(100, 40)).toBe("cancelled");
  expect(marketFinalStatus(100, 0)).toBe("cancelled");
});
