import { describe, expect, test } from "bun:test";
import { searchCoins, seedsPlace, type CoinEntry } from "./coin-search";

const list: CoinEntry[] = [
  [1, "Bitcoin", "BTC", 1],
  [32196, "Hyperliquid", "HYPE", 12],
  [99, "HyperBTC Fake", "HYPE", 3000],
  [5, "Bitcoin Cash", "BCH", 20],
  [6, "Wrapped Bitcoin", "WBTC", 15],
];

describe("coin research search", () => {
  test("hyperliquid finds Hyperliquid first", () => {
    expect(searchCoins(list, "hyperliquid")[0]?.[0]).toBe(32196);
  });
  test("exact ticker ties break by rank", () => {
    expect(searchCoins(list, "hype").map((c) => c[0])).toEqual([32196, 99]);
  });
  test("bitcoin: exact name before prefix before contains", () => {
    expect(searchCoins(list, "bitcoin").map((c) => c[0])).toEqual([1, 5, 6]);
  });
  test("blank query returns nothing", () => {
    expect(searchCoins(list, "  ")).toEqual([]);
  });
});

describe("where a coin trades on Seeds", () => {
  test("home coins open Seeds' own order book", () => {
    expect(seedsPlace("TXC", "TEXITcoin")).toEqual({ kind: "book", to: "/trade/tsd-txc", label: "Trade TXC/TSD on Seeds" });
  });
  test("Bitcoin links to its market", () => {
    expect(seedsPlace("BTC", "Bitcoin")).toMatchObject({ kind: "market", slug: "btc-tsd" });
  });
  test("a copycat sharing the BTC ticker does not link", () => {
    expect(seedsPlace("BTC", "Bitcoin Hyper Moon")).toBeNull();
  });
  test("Avalanche links to its AVAX/TSD book (Z5), a copycat AVAX doesn't", () => {
    expect(seedsPlace("AVAX", "Avalanche")).toEqual({ kind: "book", to: "/trade/avax-tsd", label: "Trade AVAX/TSD on Seeds" });
    expect(seedsPlace("AVAX", "Avax Doge")).toBeNull();
  });
  test("real Hyperliquid links to HYPE/TSD; a copycat HYPE doesn't", () => {
    expect(seedsPlace("HYPE", "Hyperliquid")).toEqual({ kind: "book", to: "/trade/hype-tsd", label: "Trade HYPE/TSD on Seeds" });
    expect(seedsPlace("HYPE", "Hyperliquid (Solana)")).toBeNull();
  });
});
