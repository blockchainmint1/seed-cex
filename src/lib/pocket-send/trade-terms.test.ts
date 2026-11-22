import { describe, expect, test } from "bun:test";
import { memberSideOf, priceKey, referencePrice, tradeTerms } from "./trade-terms";

describe("exchange trade tap text (audit R1)", () => {
  test("a seller sees what they sell, at what price and what they get back", () => {
    const t = tradeTerms({ memberSide: "sell", baseSymbol: "TXC", quoteSymbol: "TSD", amount: 100, price: 0.099, reference: 0.1 });
    expect(t.line).toBe("Sell 100 TXC for 9.9 TSD at 0.099 TSD each (recent price 0.1)");
    expect(t.warning).toBeNull(); // 1% below: within 5%
  });
  test("a buyer sees what they buy and what it costs", () => {
    const t = tradeTerms({ memberSide: "buy", baseSymbol: "TXC", quoteSymbol: "TSD", amount: 50, price: 0.1, reference: 0.1 });
    expect(t.line).toBe("Buy 50 TXC for 5 TSD at 0.1 TSD each (recent price 0.1)");
    expect(t.warning).toBeNull();
  });
  test("selling more than 5% below the recent price warns", () => {
    const t = tradeTerms({ memberSide: "sell", baseSymbol: "TXC", quoteSymbol: "TSD", amount: 100, price: 0.01, reference: 0.1 });
    expect(t.warning).toBe("This price is 90% below the recent price. Decline if you didn't place this order.");
  });
  test("buying more than 5% above the recent price warns", () => {
    const t = tradeTerms({ memberSide: "buy", baseSymbol: "TXC", quoteSymbol: "TSD", amount: 1, price: 0.12, reference: 0.1 });
    expect(t.warning).toBe("This price is 20% above the recent price. Decline if you didn't place this order.");
  });
  test("exactly 5% away does not warn; a good price never warns", () => {
    expect(tradeTerms({ memberSide: "sell", baseSymbol: "TXC", quoteSymbol: "TSD", amount: 1, price: 0.095, reference: 0.1 }).warning).toBeNull();
    expect(tradeTerms({ memberSide: "sell", baseSymbol: "TXC", quoteSymbol: "TSD", amount: 1, price: 0.5, reference: 0.1 }).warning).toBeNull();
    expect(tradeTerms({ memberSide: "buy", baseSymbol: "TXC", quoteSymbol: "TSD", amount: 1, price: 0.01, reference: 0.1 }).warning).toBeNull();
  });
  test("with no recent price the tap says so", () => {
    const t = tradeTerms({ memberSide: "sell", baseSymbol: "TXC", quoteSymbol: "TSD", amount: 2, price: 0.1, reference: null });
    expect(t.line).toBe("Sell 2 TXC for 0.2 TSD at 0.1 TSD each (no recent price to compare)");
    expect(t.warning).toBeNull();
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
