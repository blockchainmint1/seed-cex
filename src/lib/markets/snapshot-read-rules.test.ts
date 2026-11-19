import { describe, expect, test } from "bun:test";
import { coversAll, isFresh, storedMarketView, storedMarketViews, STORED_MAX_AGE_MINUTES } from "./snapshot-read-rules";

const NOW = Date.parse("2026-11-19T20:50:00.000Z");

const stored = (over: Record<string, unknown> = {}) => ({
  bucket: "2026-11-19T20:45:00.000Z",
  slug: "btc-tsd",
  pool: "BTC.BTC",
  base: "BTC",
  name: "Bitcoin",
  price: 90000,
  liquidity: 12_500_000,
  volume_24h: 4_100_000,
  change_pct: 1.5,
  live: true,
  status: "available",
  trading_halted: false,
  synth_mint_paused: true,
  balance_asset: 188.4,
  balance_rune: 22501243.5,
  pending_inbound_asset: 1.56,
  pending_inbound_rune: 0,
  synth_supply: 517.4,
  synth_units: 1e24,
  synth_supply_remaining: 0,
  pool_units: 1e25,
  lp_units: 196412898527083,
  savers_depth: 516.1,
  savers_units: 49167830592,
  savers_fill_bps: 0,
  savers_capacity_remaining: 0,
  derived_depth_bps: 10001,
  volume_asset: 12.3,
  volume_rune: 99.9,
  asset_tor_price: 62004.29,
  high_24h: 91000,
  low_24h: 88000,
  spark: [89000, 89500, 90000],
  ...over,
});

describe("isFresh", () => {
  test("a slice inside the window is fresh", () => {
    expect(isFresh("2026-11-19T20:45:00.000Z", 15, NOW)).toBe(true);
    expect(isFresh(new Date("2026-11-19T20:49:59.000Z"), 15, NOW)).toBe(true);
  });
  test("a slice past the window is stale, so the app asks THORChain", () => {
    expect(isFresh("2026-11-19T20:34:59.000Z", 15, NOW)).toBe(false);
    expect(isFresh("2026-11-19T20:30:00.000Z", 15, NOW)).toBe(false);
  });
  test("a slice a little in the future still counts, a long way ahead does not", () => {
    expect(isFresh("2026-11-19T20:53:00.000Z", 15, NOW)).toBe(true);
    expect(isFresh("2026-11-19T21:30:00.000Z", 15, NOW)).toBe(false);
  });
  test("nothing, or a broken timestamp, is never fresh", () => {
    expect(isFresh(null, 15, NOW)).toBe(false);
    expect(isFresh(undefined, 15, NOW)).toBe(false);
    expect(isFresh("not a time", 15, NOW)).toBe(false);
    expect(isFresh(new Date(NaN), 15, NOW)).toBe(false);
  });
  test("the window is 15 minutes", () => {
    expect(STORED_MAX_AGE_MINUTES).toBe(15);
  });
});

describe("storedMarketView", () => {
  test("maps a stored row to the figures the pages show", () => {
    expect(storedMarketView(stored())).toEqual({
      slug: "btc-tsd",
      pool: "BTC.BTC",
      base: "BTC",
      name: "Bitcoin",
      price: 90000,
      liquidity: 12_500_000,
      live: true,
      day: { changePct: 1.5, high: 91000, low: 88000, volume: 4_100_000 },
      spark: [89000, 89500, 90000],
    });
  });

  test("PostgREST strings are read as numbers", () => {
    const v = storedMarketView(stored({ price: "90000.5", liquidity: "12500000", volume_24h: "4100000", change_pct: "-1.5", high_24h: "91000", low_24h: "88000", spark: ["89000", "90000"] }));
    expect(v?.price).toBe(90000.5);
    expect(v?.liquidity).toBe(12_500_000);
    expect(v?.day).toEqual({ changePct: -1.5, high: 91000, low: 88000, volume: 4_100_000 });
    expect(v?.spark).toEqual([89000, 90000]);
  });

  test("a row with no usable price is dropped", () => {
    expect(storedMarketView(stored({ price: null }))).toBeNull();
    expect(storedMarketView(stored({ price: 0 }))).toBeNull();
    expect(storedMarketView(stored({ price: "bad" }))).toBeNull();
    expect(storedMarketView(stored({ slug: "" }))).toBeNull();
    expect(storedMarketView(null as never)).toBeNull();
  });

  test("a market with only one reading still gets a high and low", () => {
    const v = storedMarketView(stored({ high_24h: null, low_24h: null }));
    expect(v?.day.high).toBe(90000);
    expect(v?.day.low).toBe(90000);
  });

  test("missing liquidity and volume are blank or zero, never invented", () => {
    const v = storedMarketView(stored({ liquidity: null, volume_24h: null, change_pct: null, live: null }));
    expect(v?.liquidity).toBeNull();
    expect(v?.day.volume).toBe(0);
    expect(v?.day.changePct).toBeNull();
    expect(v?.live).toBe(false);
  });

  test("a broken sparkline keeps only real prices", () => {
    const v = storedMarketView(stored({ spark: [89000, null, "bad", 0, 90000] }));
    expect(v?.spark).toEqual([89000, 90000]);
    expect(storedMarketView(stored({ spark: null }))?.spark).toEqual([]);
  });
});

describe("storedMarketViews", () => {
  test("keeps every usable row and drops the rest", () => {
    const rows = storedMarketViews([stored(), stored({ price: null }), stored({ slug: "eth-tsd" }), null as never]);
    expect(rows.map((r) => r.slug)).toEqual(["btc-tsd", "eth-tsd"]);
  });
  test("an empty or missing slice yields nothing", () => {
    expect(storedMarketViews([])).toEqual([]);
    expect(storedMarketViews(null)).toEqual([]);
    expect(storedMarketViews(undefined)).toEqual([]);
  });
});

describe("coversAll", () => {
  const slugs = ["btc-tsd", "eth-tsd", "sol-tsd"];
  test("a slice with every market the page lists can be shown", () => {
    expect(coversAll(storedMarketViews([stored(), stored({ slug: "eth-tsd" }), stored({ slug: "sol-tsd" })]), slugs)).toBe(true);
  });
  test("a slice missing a market is refused, so no coin silently disappears", () => {
    expect(coversAll(storedMarketViews([stored(), stored({ slug: "eth-tsd" })]), slugs)).toBe(false);
    expect(coversAll(storedMarketViews([stored(), stored({ slug: "eth-tsd" }), stored({ slug: "sol-tsd", price: null })]), slugs)).toBe(false);
  });
  test("an empty or missing slice covers nothing", () => {
    expect(coversAll([], slugs)).toBe(false);
    expect(coversAll(null, slugs)).toBe(false);
    expect(coversAll(undefined, slugs)).toBe(false);
  });
});
