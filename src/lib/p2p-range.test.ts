import { describe, expect, test } from "bun:test";
import { offerRange } from "./p2p-range";

describe("P2P sell-ad range follows the seller's trading pocket", () => {
  test("a pocket that covers the whole range shows the seller's own range", () => {
    const r = offerRange({ side: "sell", minFiat: 20, maxFiat: 500, available: 950, price: 1 });
    expect(r).toMatchObject({ min: 20, max: 500, reduced: false, live: true, shortCoins: 0 });
  });
  test("a pocket that covers less than the max reduces the max to what it covers", () => {
    // Seller asks $20–$1,000 but has 950 TSD free at $1.
    const r = offerRange({ side: "sell", minFiat: 20, maxFiat: 1000, available: 950, price: 1 });
    expect(r.max).toBe(950);
    expect(r.reduced).toBe(true);
    expect(r.live).toBe(true);
    expect(r.shortCoins).toBeCloseTo(50, 6);
  });
  test("the reduced max rounds down to the cent, never up", () => {
    // 9,999.999145 TXC at $0.0882 covers $881.99992… → $881.99.
    const r = offerRange({ side: "sell", minFiat: 20, maxFiat: 5000, available: 9999.999145, price: 0.0882 });
    expect(r.max).toBe(881.99);
  });
  test("a pocket that can't cover the min hides the ad", () => {
    const r = offerRange({ side: "sell", minFiat: 20, maxFiat: 500, available: 15, price: 1 });
    expect(r.live).toBe(false);
  });
  test("an empty or unreadable pocket hides the ad", () => {
    expect(offerRange({ side: "sell", minFiat: 20, maxFiat: 500, available: 0, price: 1 }).live).toBe(false);
    expect(offerRange({ side: "sell", minFiat: 20, maxFiat: 500, available: Number.NaN, price: 1 }).live).toBe(false);
    expect(offerRange({ side: "sell", minFiat: 20, maxFiat: 500, available: 100, price: 0 }).live).toBe(false);
  });
  test("buy ads are never reduced (the ad owner pays cash, not coins)", () => {
    const r = offerRange({ side: "buy", minFiat: 20, maxFiat: 1000, available: 0, price: 1 });
    expect(r).toMatchObject({ max: 1000, reduced: false, live: true });
  });
});
