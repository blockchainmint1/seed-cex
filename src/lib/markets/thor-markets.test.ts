import { describe, expect, test } from "bun:test";
import { CHART_RANGE_IDS, CHART_RANGES, dayStats, fmtTsd, marketRangeCandles, parseCmcOhlcv, rangeCandleSeconds, withLiveCandle, withLivePrice, mergeCandles, parseCandles, priceDecimals, THOR_MARKETS, thorMarket, thorMarketForBookBase } from "./thor-markets";
import { swapCoin } from "@/lib/xchain/assets";
import { PAIRS } from "@/lib/chains";

describe("primary markets", () => {
  test("BTC/TSD and ETH/TSD lead the list", () => {
    expect(THOR_MARKETS[0].slug).toBe("btc-tsd");
    expect(THOR_MARKETS[1].slug).toBe("eth-tsd");
  });
  test("every market is quoted in TSD and maps to a THORChain coin on the Swap page", () => {
    for (const m of THOR_MARKETS) {
      expect(m.slug).toBe(`${m.base.toLowerCase()}-tsd`);
      const c = swapCoin(m.swapId);
      expect(c?.asset).toBe(m.pool);
      expect(c?.protocols).toContain("thorchain");
    }
  });
  test("every order-book link points at a real Seeds order book", () => {
    for (const m of THOR_MARKETS.filter((x) => x.book)) {
      expect(PAIRS.some((p) => `/trade/${p.slug}` === m.book && p.base === m.base && p.quote === "TSD")).toBe(true);
    }
  });
  test("order-book coins link to their THORChain market", () => {
    expect(thorMarketForBookBase("BTC")?.pool).toBe("BTC.BTC");
    expect(thorMarketForBookBase("TXC")).toBeNull();
    expect(thorMarket("ETH")?.slug).toBe("eth-tsd");
    expect(thorMarket("nope")).toBeNull();
  });
});

describe("candles", () => {
  test("TSD prices are THORChain's dollar prices; volume converts from cents", () => {
    const c = parseCandles(
      [{ startTime: "3600", openPriceUSD: "100", highPriceUSD: "110", lowPriceUSD: "95", closePriceUSD: "105" }],
      [{ startTime: "3600", totalVolumeUSD: "123456" }],
    );
    expect(c).toEqual([{ time: 3600, open: 100, high: 110, low: 95, close: 105, volume: 1234.56 }]);
  });
  test("a pool's first interval with a zero open is dropped", () => {
    const c = parseCandles([
      { startTime: "0", openPriceUSD: "0", highPriceUSD: "0", lowPriceUSD: "0", closePriceUSD: "5" },
      { startTime: "60", openPriceUSD: "5", highPriceUSD: "6", lowPriceUSD: "4", closePriceUSD: "5.5" },
    ]);
    expect(c.map((x) => x.time)).toEqual([60]);
  });
  test("high and low always contain open and close", () => {
    const [c] = parseCandles([{ startTime: "1", openPriceUSD: "10", highPriceUSD: "9", lowPriceUSD: "11", closePriceUSD: "12" }]);
    expect(c.high).toBe(12);
    expect(c.low).toBe(10);
  });
  test("four hourly candles merge into one 4-hour candle", () => {
    const h = [0, 1, 2, 3].map((i) => ({ time: i * 3600, open: 10 + i, high: 20 + i, low: 5 - i, close: 11 + i, volume: 1 }));
    expect(mergeCandles(h, 4, 3600)).toEqual([{ time: 0, open: 10, high: 23, low: 2, close: 14, volume: 4 }]);
  });
});

describe("live price", () => {
  const c = [{ time: 3600, open: 100, high: 101, low: 99, close: 100, volume: 0 }];
  test("the open candle follows the live pool price", () => {
    expect(withLivePrice(c, 105, 3600, 4000)[0]).toEqual({ time: 3600, open: 100, high: 105, low: 99, close: 105, volume: 0 });
  });
  test("a still-open candle that repeats the previous one starts from the previous close", () => {
    const rep = [{ time: 0, open: 90, high: 102, low: 88, close: 100, volume: 5 }, { time: 3600, open: 90, high: 102, low: 88, close: 100, volume: 1 }];
    expect(withLivePrice(rep, 98, 3600, 4000)[1]).toEqual({ time: 3600, open: 100, high: 100, low: 98, close: 98, volume: 1 });
  });
  test("daily candles merge into Monday-to-Sunday weeks", () => {
    const monday = 1794614400 - ((1794614400 / 86400 + 3) % 7) * 86400; // Monday on or before
    const days = Array.from({ length: 9 }, (_, i) => ({ time: monday + i * 86400, open: i + 1, high: i + 2, low: i, close: i + 1.5, volume: 1 }));
    const w = mergeCandles(days, 7, 86400);
    expect(w.map((c) => c.time)).toEqual([monday, monday + 7 * 86400]);
    expect(w[0]).toEqual({ time: monday, open: 1, high: 8, low: 0, close: 7.5, volume: 7 });
    expect(new Date(monday * 1000).getUTCDay()).toBe(1);
  });
  test("a closed candle is never rewritten", () => {
    expect(withLivePrice(c, 105, 3600, 7200)).toEqual(c);
  });
});

describe("24-hour stats", () => {
  test("change is measured from the open 24 hourly candles ago to the live price", () => {
    const h = Array.from({ length: 30 }, (_, i) => ({ time: i * 3600, open: 100 + i, high: 200, low: 50, close: 101 + i, volume: 10 }));
    const s = dayStats(h, 132);
    expect(s.changePct).toBeCloseTo(((132 - 106) / 106) * 100, 8);
    expect(s.volume).toBe(240);
    expect(s.high).toBe(200);
    expect(s.low).toBe(50);
  });
  test("no history means no change shown", () => {
    expect(dayStats([], 5).changePct).toBeNull();
  });
});

describe("price format", () => {
  test("decimals follow the price size", () => {
    expect(priceDecimals(63286.3)).toBe(2);
    expect(priceDecimals(1.2871)).toBe(4);
    expect(priceDecimals(0.0655)).toBe(5);
    expect(priceDecimals(0.0003)).toBe(8);
    expect(fmtTsd(63286.329)).toBe("63,286.33");
  });
});

describe("chart ranges", () => {
  test("buttons read 1D 7D 1M 3M 1Y All, in that order", () => {
    expect(CHART_RANGE_IDS.map((r) => CHART_RANGES[r].label)).toEqual(["1D", "7D", "1M", "3M", "1Y", "All"]);
  });
  test("1D covers 24 hours of 15-minute candles from the pool", () => {
    const r = CHART_RANGES["1d"];
    expect(r.source).toBe("pool");
    if (r.source === "pool") expect(r.count * 300).toBe(24 * 3600);
    expect(rangeCandleSeconds("1d")).toBe(900);
  });
  test("7D covers 7 days of hourly pool candles; 1M 30 days of 4-hour candles", () => {
    const w = CHART_RANGES["7d"];
    const m = CHART_RANGES["1m"];
    if (w.source === "pool") expect(w.count * 3600).toBe(7 * 86400);
    if (m.source === "pool") expect(m.count * 3600).toBe(30 * 86400);
    expect(rangeCandleSeconds("1m")).toBe(4 * 3600);
  });
  test("1Y shows the last 365 daily market candles", () => {
    const daily = Array.from({ length: 500 }, (_, i) => ({ time: i * 86400, open: 1, high: 1, low: 1, close: 1, volume: 0 }));
    const y = marketRangeCandles(daily, "1y");
    expect(y.length).toBe(365);
    expect(y[364]!.time).toBe(499 * 86400);
    expect(marketRangeCandles(daily, "3m").length).toBe(90);
  });
  test("All keeps every day, merged into Monday-start weeks", () => {
    const daily = Array.from({ length: 28 }, (_, i) => ({ time: (4 + i) * 86400, open: i + 1, high: i + 2, low: i + 0.5, close: i + 1.5, volume: 1 }));
    const w = marketRangeCandles(daily, "all");
    expect(w.length).toBe(4);
    expect(w[0]).toEqual({ time: 4 * 86400, open: 1, high: 8, low: 0.5, close: 7.5, volume: 7 });
    expect(rangeCandleSeconds("all")).toBe(7 * 86400);
  });
});

describe("market history", () => {
  test("CoinMarketCap daily rows become candles; empty prices are dropped", () => {
    const raw = { data: { quotes: [
      { time_open: "2026-11-19T00:00:00.000Z", quote: { USD: { open: 62987, high: 64017, low: 61381, close: 61902, volume: 5e10 } } },
      { time_open: "2026-11-18T00:00:00.000Z", quote: { USD: { open: 64894, high: 64929, low: 62017, close: 62987, volume: 4e10 } } },
      { time_open: "2026-11-17T00:00:00.000Z", quote: { USD: { open: 0, high: 0, low: 0, close: 0, volume: 0 } } },
    ] } };
    const c = parseCmcOhlcv(raw);
    expect(c.length).toBe(2);
    expect(c[0]).toEqual({ time: Date.parse("2026-11-18T00:00:00Z") / 1000, open: 64894, high: 64929, low: 62017, close: 62987, volume: 4e10 });
    expect(parseCmcOhlcv({})).toEqual([]);
  });
  test("today's candle starts at yesterday's close and follows the live price", () => {
    const day = 86400;
    const c = [{ time: 10 * day, open: 100, high: 110, low: 95, close: 105, volume: 9 }];
    expect(withLiveCandle(c, 108, day, 11 * day + 60)[1]).toEqual({ time: 11 * day, open: 105, high: 108, low: 105, close: 108, volume: 0 });
    expect(withLiveCandle(c, 108, day, 10 * day + 60)[0]!.close).toBe(108);
    // History more than a day behind: no fake candle.
    expect(withLiveCandle(c, 108, day, 13 * day)).toEqual(c);
  });
});
