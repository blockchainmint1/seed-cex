import { describe, expect, test } from "bun:test";
import { memberSideOf, outsidePrice, pickReference, priceKey, referencePrice, tradeTerms } from "./trade-terms";

const out = (price: number) => ({ price, source: "outside" as const });
const own = (price: number) => ({ price, source: "seeds" as const });

describe("exchange trade tap text (audit R1)", () => {
  test("a seller sees what they sell, at what price and what they get back", () => {
    const t = tradeTerms({ memberSide: "sell", baseSymbol: "TXC", quoteSymbol: "TSD", amount: 100, price: 0.099, reference: out(0.1) });
    expect(t.line).toBe("Sell 100 TXC for 9.9 TSD at 0.099 TSD each (market price 0.1)");
    expect(t.warning).toBeNull(); // 1% below: within 5%
  });
  test("a buyer sees what they buy and what it costs", () => {
    const t = tradeTerms({ memberSide: "buy", baseSymbol: "TXC", quoteSymbol: "TSD", amount: 50, price: 0.1, reference: out(0.1) });
    expect(t.line).toBe("Buy 50 TXC for 5 TSD at 0.1 TSD each (market price 0.1)");
    expect(t.warning).toBeNull();
  });
  test("selling more than 5% below the recent price warns", () => {
    const t = tradeTerms({ memberSide: "sell", baseSymbol: "TXC", quoteSymbol: "TSD", amount: 100, price: 0.01, reference: out(0.1) });
    expect(t.warning).toBe("This price is 90% below the market price. Decline if you didn't place this order.");
  });
  test("buying more than 5% above the recent price warns", () => {
    const t = tradeTerms({ memberSide: "buy", baseSymbol: "TXC", quoteSymbol: "TSD", amount: 1, price: 0.12, reference: out(0.1) });
    expect(t.warning).toBe("This price is 20% above the market price. Decline if you didn't place this order.");
  });
  test("exactly 5% away does not warn; a good price never warns", () => {
    expect(tradeTerms({ memberSide: "sell", baseSymbol: "TXC", quoteSymbol: "TSD", amount: 1, price: 0.095, reference: out(0.1) }).warning).toBeNull();
    expect(tradeTerms({ memberSide: "sell", baseSymbol: "TXC", quoteSymbol: "TSD", amount: 1, price: 0.5, reference: out(0.1) }).warning).toBeNull();
    expect(tradeTerms({ memberSide: "buy", baseSymbol: "TXC", quoteSymbol: "TSD", amount: 1, price: 0.01, reference: out(0.1) }).warning).toBeNull();
  });
  test("with no price at all the tap tells the member to check it", () => {
    const t = tradeTerms({ memberSide: "sell", baseSymbol: "ISK", quoteSymbol: "TSD", amount: 2, price: 0.1, reference: null });
    expect(t.line).toBe("Sell 2 ISK for 0.2 TSD at 0.1 TSD each (no outside price to compare — check this price yourself)");
    expect(t.warning).toBeNull();
  });
  test("a Seeds-only price says there's no outside price, and still warns past 5%", () => {
    const t = tradeTerms({ memberSide: "sell", baseSymbol: "ZCU", quoteSymbol: "TSD", amount: 10, price: 0.5, reference: own(1) });
    expect(t.line).toBe("Sell 10 ZCU for 5 TSD at 0.5 TSD each (Seeds price 1; no outside price — check this price yourself)");
    expect(t.warning).toBe("This price is 50% below the Seeds price. Decline if you didn't place this order.");
  });
  test("an outside price beats Seeds' own book (a thin book can be the other side's own order)", () => {
    // TXC on CoinMarketCap at $0.10; the only resting order (an accomplice's) sits at 0.01.
    const ref = pickReference(outsidePrice("TXC", "TSD", (s) => (s === "TXC" ? 0.1 : null)), 0.01);
    expect(ref).toEqual({ price: 0.1, source: "outside" });
    const t = tradeTerms({ memberSide: "sell", baseSymbol: "TXC", quoteSymbol: "TSD", amount: 100, price: 0.01, reference: ref });
    expect(t.warning).toBe("This price is 90% below the market price. Decline if you didn't place this order.");
  });
  test("outside price: TSD = $1, USDC/USDT fall back to $1, unknown coins have none", () => {
    expect(outsidePrice("BTC", "TSD", (s) => (s === "BTC" ? 90000 : null))).toBe(90000);
    expect(outsidePrice("TSD", "USDC", () => null)).toBe(1);
    expect(outsidePrice("TSD", "USDC", (s) => (s === "USDC" ? 0.5 : null))).toBe(2);
    expect(outsidePrice("ISK", "TSD", () => null)).toBeNull();
    expect(outsidePrice("pHEX", "TSD", (s) => (s === "pHEX" ? 0.004 : null))).toBe(0.004);
  });
  test("with no outside price the Seeds price is used; with neither, none", () => {
    expect(pickReference(null, 0.2)).toEqual({ price: 0.2, source: "seeds" });
    expect(pickReference(0, 0.2)).toEqual({ price: 0.2, source: "seeds" });
    expect(pickReference(null, null)).toBeNull();
  });
  test("the maker is on the opposite side of the taker", () => {
    expect(memberSideOf("sell", true)).toBe("sell");
    expect(memberSideOf("sell", false)).toBe("buy");
    expect(memberSideOf("buy", false)).toBe("sell");
  });
  test("recent price = last real trade, else the middle of the book", () => {
    expect(referencePrice({ lastPrinted: 0.1, bestBid: 0.05, bestAsk: 0.2 })).toBe(0.1);
    expect(referencePrice({ lastPrinted: null, bestBid: 0.09, bestAsk: 0.11 })).toBeCloseTo(0.1);
    expect(referencePrice({ lastPrinted: null, bestBid: 0.09, bestAsk: null })).toBeNull();
  });
  test("the price bound into the tap reads the same from a number or the stored text", () => {
    expect(priceKey(0.099)).toBe(priceKey("0.0990"));
    expect(priceKey(0.1)).not.toBe(priceKey(0.11));
  });
});
