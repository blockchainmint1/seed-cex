import { describe, expect, test } from "bun:test";
import { bookRow, HOME_COIN_MARKETS, nextSort, sortRows, type PrimaryRow } from "./primary-rows";
import { PAIRS } from "@/lib/chains";

const NOW = Date.parse("2026-11-21T12:00:00Z");
const ago = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const m = { slug: "tsd-txc", base: "TXC", name: "TEXITcoin" };
const noBook = { bids: [], asks: [] };

describe("home coins in Primary markets", () => {
  test("TXC, ISK and ZCU are listed against TSD, each with a real Seeds order book", () => {
    expect(HOME_COIN_MARKETS.map((h) => `${h.base}/TSD`)).toEqual(["TXC/TSD", "ISK/TSD", "ZCU/TSD"]);
    for (const h of HOME_COIN_MARKETS) {
      const p = PAIRS.find((x) => x.id === h.pairId);
      expect(p?.slug).toBe(h.slug);
      expect(p?.base).toBe(h.base);
      expect(p?.quote).toBe("TSD");
    }
  });
});

describe("bookRow", () => {
  test("24h change is measured from the last trade before the window", () => {
    const r = bookRow(m, [
      { price: 0.12, amount: 10, createdAt: ago(1) },
      { price: 0.11, amount: 5, createdAt: ago(5) },
      { price: 0.1, amount: 100, createdAt: ago(30) },
    ], noBook, NOW);
    expect(r.price).toBe(0.12);
    expect(r.changePct).toBeCloseTo(20, 6);
    expect(r.high).toBe(0.12);
    expect(r.low).toBe(0.11);
    expect(r.volume).toBeCloseTo(0.12 * 10 + 0.11 * 5, 9); // only last-24h trades, in TSD
  });

  test("no trades today: price holds, change 0%, no high/low, no volume", () => {
    const r = bookRow(m, [{ price: 0.1, amount: 3, createdAt: ago(48) }], noBook, NOW);
    expect(r.price).toBe(0.1);
    expect(r.changePct).toBe(0);
    expect(r.high).toBeNull();
    expect(r.volume).toBe(0);
  });

  test("never traded: price is the book mid and is marked as such", () => {
    const r = bookRow(m, [], { bids: [{ price: 0.9, amount: 10 }], asks: [{ price: 1.1, amount: 5 }] }, NOW);
    expect(r.price).toBeCloseTo(1, 9);
    expect(r.priceIsMid).toBe(true);
    expect(r.changePct).toBeNull();
    expect(r.liquidity).toBeCloseTo(9 + 5.5, 9);
  });

  test("never traded and one-sided book: no price", () => {
    const r = bookRow(m, [], { bids: [], asks: [{ price: 1.1, amount: 5 }] }, NOW);
    expect(r.price).toBeNull();
    expect(r.priceIsMid).toBe(false);
  });
});

const row = (base: string, price: number | null, volume: number): PrimaryRow => ({
  key: base, base, name: base, source: "thor", slug: base, price, priceIsMid: false,
  changePct: null, high: null, low: null, volume, liquidity: null, live: true, spark: [],
});

describe("sorting", () => {
  const rows = [row("BTC", 60000, 5), row("TXC", null, 0), row("ETH", 1600, 9), row("ATOM", 3, 9)];

  test("price biggest first, missing prices last either way", () => {
    expect(sortRows(rows, { key: "price", dir: "desc" }).map((r) => r.base)).toEqual(["BTC", "ETH", "ATOM", "TXC"]);
    expect(sortRows(rows, { key: "price", dir: "asc" }).map((r) => r.base)).toEqual(["ATOM", "ETH", "BTC", "TXC"]);
  });

  test("market name A to Z; ties keep the default order", () => {
    expect(sortRows(rows, { key: "market", dir: "asc" }).map((r) => r.base)).toEqual(["ATOM", "BTC", "ETH", "TXC"]);
    expect(sortRows(rows, { key: "volume", dir: "desc" }).map((r) => r.base)).toEqual(["ETH", "ATOM", "BTC", "TXC"]);
  });

  test("clicking a header: first click, flip, then back to default", () => {
    const a = nextSort(null, "price");
    expect(a).toEqual({ key: "price", dir: "desc" });
    const b = nextSort(a, "price");
    expect(b).toEqual({ key: "price", dir: "asc" });
    expect(nextSort(b, "price")).toBeNull();
    expect(nextSort(b, "market")).toEqual({ key: "market", dir: "asc" });
    expect(sortRows(rows, null)).toBe(rows);
  });
});
