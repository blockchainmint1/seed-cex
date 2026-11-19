import { describe, expect, test } from "bun:test";
import {
  snapshotBucket,
  marketRows,
  chainRows,
  networkRow,
  SNAPSHOT_INTERVAL_MINUTES,
  SNAPSHOT_RAW_RETENTION_DAYS,
  SNAPSHOT_ROLLUP_RETENTION_DAYS,
} from "./snapshot-rules";

const market = (over: Record<string, unknown> = {}) => ({
  slug: "btc-tsd",
  pool: "BTC.BTC",
  base: "BTC",
  name: "Bitcoin",
  price: 90000,
  liquidity: 12_500_000,
  live: true,
  day: { volume: 4_100_000, changePct: 1.5 },
  ...over,
});

const pool = (over: Record<string, unknown> = {}) => ({
  asset: "BTC.BTC",
  status: "Available",
  short_code: "b",
  asset_tor_price: "6200429555749",
  balance_asset: "18844830839",
  balance_rune: "2250124355250238",
  pending_inbound_asset: "156079849",
  pending_inbound_rune: "0",
  pool_units: "10162725816918528361619440",
  LP_units: "196412898527083",
  synth_units: "10162725816722115463092357",
  synth_supply: "51741641679",
  synth_supply_remaining: "0",
  savers_depth: "51613139211",
  savers_units: "49167830592",
  savers_fill_bps: "0",
  savers_capacity_remaining: "0",
  derived_depth_bps: "10001",
  synth_mint_paused: true,
  trading_halted: false,
  volume_asset: "1234567890",
  volume_rune: "999",
  ...over,
});

describe("snapshotBucket", () => {
  test("truncates to the 5-minute boundary", () => {
    expect(snapshotBucket(new Date("2026-11-19T20:48:31Z"))).toBe("2026-11-19T20:45:00.000Z");
    expect(snapshotBucket(new Date("2026-11-19T20:45:00Z"))).toBe("2026-11-19T20:45:00.000Z");
    expect(snapshotBucket(new Date("2026-11-19T20:49:59Z"))).toBe("2026-11-19T20:45:00.000Z");
  });
  test("two reads in the same window land on the same bucket", () => {
    expect(snapshotBucket("2026-11-19T20:46:10Z")).toBe(snapshotBucket("2026-11-19T20:49:30Z"));
  });
  test("an unreadable time still yields a real bucket", () => {
    expect(snapshotBucket("not a time")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
  });
  test("the cadence is 5 minutes", () => {
    expect(SNAPSHOT_INTERVAL_MINUTES).toBe(5);
  });
});

describe("marketRows", () => {
  test("stores the price the page showed and the pool detail in whole coins", () => {
    const [r] = marketRows([market()], [pool()], "2026-11-19T20:45:00.000Z");
    expect(r).toMatchObject({
      bucket: "2026-11-19T20:45:00.000Z",
      slug: "btc-tsd",
      pool: "BTC.BTC",
      short_code: "b",
      price: 90000,
      liquidity: 12_500_000,
      volume_24h: 4_100_000,
      change_pct: 1.5,
      live: true,
      status: "available",
      trading_halted: false,
      synth_mint_paused: true,
    });
    // 18844830839 base units = 188.44830839 BTC
    expect(r.balance_asset).toBeCloseTo(188.44830839, 8);
    expect(r.pending_inbound_asset).toBeCloseTo(1.56079849, 8);
    expect(r.synth_supply).toBeCloseTo(517.41641679, 8);
    expect(r.savers_depth).toBeCloseTo(516.13139211, 8);
    expect(r.asset_tor_price).toBeCloseTo(62004.29555749, 6);
    // unit counts are stored as reported, not divided
    expect(r.lp_units).toBe(196412898527083);
    expect(r.savers_fill_bps).toBe(0);
    expect(r.derived_depth_bps).toBe(10001);
  });

  test("a market with no price is not recorded at all", () => {
    expect(marketRows([market({ price: null }), market({ slug: "eth-tsd", price: 0 }), market({ slug: "sol-tsd", price: NaN })], [], "b")).toEqual([]);
  });

  test("a market whose pool is missing from the raw read is still stored, with blanks", () => {
    const [r] = marketRows([market()], [], "b");
    expect(r.price).toBe(90000);
    expect(r.balance_asset).toBeNull();
    expect(r.status).toBeNull();
    expect(r.trading_halted).toBeNull();
    expect(r.volume_24h).toBe(4_100_000);
  });

  test("missing liquidity and volume are blank or zero, never invented", () => {
    const [r] = marketRows([market({ liquidity: null, day: { volume: NaN, changePct: null } })], [pool()], "b");
    expect(r.liquidity).toBeNull();
    expect(r.volume_24h).toBe(0);
    expect(r.change_pct).toBeNull();
  });

  test("a market seen twice keeps its first reading", () => {
    const rows = marketRows([market({ price: 90000 }), market({ price: 1 })], [pool()], "b");
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(90000);
  });

  test("a duplicated pool asset keeps its first entry", () => {
    const [r] = marketRows([market()], [pool({ balance_asset: "100000000" }), pool({ balance_asset: "900000000" })], "b");
    expect(r.balance_asset).toBeCloseTo(1, 8);
  });

  test("output is sorted by slug so a re-run writes the same rows", () => {
    const rows = marketRows([market({ slug: "zec-tsd" }), market({ slug: "btc-tsd" }), market({ slug: "atom-tsd" })], [], "b");
    expect(rows.map((r) => r.slug)).toEqual(["atom-tsd", "btc-tsd", "zec-tsd"]);
  });

  test("an empty or broken read stores nothing", () => {
    expect(marketRows([], [], "b")).toEqual([]);
    expect(marketRows(undefined as never, undefined as never, "b")).toEqual([]);
    expect(marketRows([null as never, market({ slug: "" })], [null as never], "b")).toEqual([]);
  });
});

describe("chainRows", () => {
  const inbound = {
    chain: "AVAX",
    halted: false,
    global_trading_paused: false,
    chain_trading_paused: false,
    chain_lp_actions_paused: false,
    gas_rate: "15",
    gas_rate_units: "nAVAX",
    observed_fee_rate: "10",
    outbound_fee: "3588253",
    outbound_tx_size: "100000",
    dust_threshold: "100000",
    router: "0x00dc6100103BC402d490aEE3F9a5560cBd91f1d4",
    address: "0x489db109a54f37ffe5464b86c0668ce84dd9cb02",
  };

  test("stores halt flags, gas and fees, with fees in whole coins", () => {
    const [r] = chainRows([inbound], "2026-11-19T20:45:00.000Z");
    expect(r).toMatchObject({
      bucket: "2026-11-19T20:45:00.000Z",
      chain: "AVAX",
      halted: false,
      global_trading_paused: false,
      chain_trading_paused: false,
      chain_lp_actions_paused: false,
      gas_rate: 15,
      gas_rate_units: "nAVAX",
      observed_fee_rate: 10,
      router: inbound.router,
      address: inbound.address,
    });
    expect(r.outbound_fee).toBeCloseTo(0.03588253, 8);
    expect(r.dust_threshold).toBeCloseTo(0.001, 8);
  });

  test("a chain with no name is dropped, and a repeat keeps the first reading", () => {
    const rows = chainRows([{ chain: "" }, { chain: "btc", gas_rate: "15" }, { chain: "BTC", gas_rate: "999" }], "b");
    expect(rows).toHaveLength(1);
    expect(rows[0].chain).toBe("BTC");
    expect(rows[0].gas_rate).toBe(15);
  });

  test("fields THORNode didn't send stay null, not zero", () => {
    const [r] = chainRows([{ chain: "DOGE" }], "b");
    expect(r.halted).toBeNull();
    expect(r.gas_rate).toBeNull();
    expect(r.outbound_fee).toBeNull();
    expect(r.router).toBeNull();
  });

  test("an empty read stores nothing", () => {
    expect(chainRows([], "b")).toEqual([]);
    expect(chainRows(undefined as never, "b")).toEqual([]);
  });
});

describe("networkRow", () => {
  const constants = { int_64_values: { NativeTransactionFee: 2000000, OutboundTransactionFee: 2000000, AsgardSize: 40, DesiredValidatorSet: 100 } };

  test("stores queue length and fees in whole RUNE", () => {
    const r = networkRow(4, constants, null, "2026-11-19T20:45:00.000Z");
    expect(r).toMatchObject({
      bucket: "2026-11-19T20:45:00.000Z",
      scheduled_queue: 4,
      native_tx_fee: 0.02,
      outbound_tx_fee: 0.02,
      asgard_size: 40,
      desired_validator_set: 100,
    });
  });

  test("node counts are counted from the list", () => {
    const nodes = [
      { status: "Active", jail: false, maintenance: false, missing_blocks: 3 },
      { status: "active", jail: true, maintenance: false, missing_blocks: "7" },
      { status: "Jailed", jail: true, maintenance: true, missing_blocks: 0 },
      { status: "Active", jail: false, maintenance: true, missing_blocks: "bad" },
    ];
    const r = networkRow(0, constants, nodes, "b");
    expect(r.nodes_total).toBe(4);
    expect(r.nodes_active).toBe(3);
    expect(r.nodes_jailed).toBe(2);
    expect(r.nodes_maintenance).toBe(2);
    expect(r.nodes_missing_blocks).toBe(10);
  });

  test("an unread node list leaves node counts null, not zero", () => {
    const r = networkRow(0, constants, null, "b");
    expect(r.nodes_total).toBeNull();
    expect(r.nodes_active).toBeNull();
    expect(r.nodes_missing_blocks).toBeNull();
  });

  test("missing constants and a bad queue length are null, not zero", () => {
    const r = networkRow(null, null, null, "b");
    expect(r.scheduled_queue).toBeNull();
    expect(r.native_tx_fee).toBeNull();
    expect(r.asgard_size).toBeNull();
    expect(networkRow(-1, constants, null, "b").scheduled_queue).toBeNull();
    expect(networkRow(NaN, constants, null, "b").scheduled_queue).toBeNull();
  });
});

describe("retention", () => {
  test("5-minute detail is kept 90 days, rollups two years", () => {
    expect(SNAPSHOT_RAW_RETENTION_DAYS).toBe(90);
    expect(SNAPSHOT_ROLLUP_RETENTION_DAYS).toBe(730);
  });
});
