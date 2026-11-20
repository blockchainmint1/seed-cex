import { describe, expect, test } from "bun:test";
import {
  CMC_IDS, cleanDescription, tradeStep, cleanLink, costRow, fromAth, parseNews, parsePairs, parsePoolTrades, parseProfile, safeUrl, supplyShare, youtubeId,
} from "./coin-research";
import { THOR_MARKETS } from "./thor-markets";

describe("CoinMarketCap ids", () => {
  test("every primary market has an id, and none repeat", () => {
    for (const m of THOR_MARKETS) expect(CMC_IDS[m.slug]).toBeGreaterThan(0);
    expect(new Set(Object.values(CMC_IDS)).size).toBe(Object.keys(CMC_IDS).length);
    expect(CMC_IDS["btc-tsd"]).toBe(1);
  });
});

describe("links", () => {
  test("only http(s) links survive", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,x")).toBeNull();
    expect(safeUrl("/relative")).toBeNull();
    expect(safeUrl("https://bitcoin.org/")).toBe("https://bitcoin.org/");
  });
  test("referral codes are stripped from exchange links", () => {
    expect(cleanLink("https://www.binance.com/en/trade/BTC_U?ref=40896146#x")).toBe("https://www.binance.com/en/trade/BTC_U");
  });
});

describe("profile", () => {
  const info = { id: 1, name: "Bitcoin", symbol: "BTC", slug: "bitcoin", logo: "https://s2.coinmarketcap.com/1.png", description: "Bitcoin is money. The last known price of Bitcoin is 61,508 USD. More information can be found at https://bitcoin.org/.", "tag-names": ["PoW", "Three Arrows Capital Portfolio"], urls: { website: ["https://bitcoin.org/"], explorer: ["https://a.example/", "javascript:x", "https://b.example/"], technical_doc: ["https://bitcoin.org/bitcoin.pdf"] } };
  const quote = { id: 1, cmc_rank: 1, circulating_supply: 20_000_000, max_supply: 21_000_000, quote: { USD: { price: 60_000, market_cap: 1.2e12, percent_change_24h: -3.5 } } };
  const perf = { periods: { all_time: { quote: { USD: { high: 120_000, high_timestamp: "2025-10-06T19:00:00Z", low: 0.05 } } } } };
  test("reads the market figures and drops unsafe links and stale price sentences", () => {
    const p = parseProfile(1, info, quote, perf)!;
    expect(p.rank).toBe(1);
    expect(p.marketCap).toBe(1.2e12);
    expect(p.ath?.price).toBe(120_000);
    expect(p.description).toBe("Bitcoin is money.");
    expect(p.tags).toEqual(["PoW"]);
    expect(p.links.map((l) => l.url)).toEqual(["https://bitcoin.org/", "https://bitcoin.org/bitcoin.pdf", "https://a.example/", "https://b.example/"]);
  });
  test("refuses an answer for a different coin (tickers repeat)", () => {
    expect(parseProfile(1, { ...info, id: 38552 }, quote, perf)).toBeNull();
  });
  test("distance from high and supply share", () => {
    expect(fromAth(60_000, 120_000)).toBe(-50);
    expect(supplyShare(20_000_000, 21_000_000)).toBeCloseTo(95.24, 2);
    expect(supplyShare(100, null)).toBeNull();
  });
  test("cleanDescription keeps ordinary text", () => {
    expect(cleanDescription("  A coin.  ")).toBe("A coin.");
    expect(cleanDescription("")).toBeNull();
  });
});

describe("other exchanges", () => {
  const pair = (name: string, vol: number, extra: Record<string, unknown> = {}) => ({
    exchange: { name }, market_pair: "BTC/USDT", category: "spot", outlier_detected: 0, exclusions: null,
    quote: { USD: { price: 60_000, volume_24h: vol } }, ...extra,
  });
  test("drops outliers, excluded markets and derivatives; one row per exchange, busiest first", () => {
    const rows = parsePairs({ data: { market_pairs: [
      pair("Binance", 5e9), pair("Binance", 1e9), pair("Shady", 9e9, { outlier_detected: 1 }),
      pair("Excluded", 8e9, { exclusions: ["volume"] }), pair("Perps", 7e9, { category: "derivatives" }), pair("Kraken", 2e9),
    ] } });
    expect(rows.map((r) => [r.exchange, r.volume24h])).toEqual([["Binance", 5e9], ["Kraken", 2e9]]);
  });
});

describe("news", () => {
  test("keeps real web links, newest first, one per title", () => {
    const n = parseNews({ data: [
      { title: "Old", subtitle: "Price fell. The post Old appeared first on Tokenist.", source_url: "https://a.example/1", released_at: "2026-11-19T00:00:00Z" },
      { title: "New", source_url: "https://a.example/2", released_at: "2026-11-20T00:00:00Z" },
      { title: "new", source_url: "https://a.example/3", released_at: "2026-11-20T01:00:00Z" },
      { title: "Bad link", source_url: "javascript:x", released_at: "2026-11-20T00:00:00Z" },
    ] });
    expect(n.map((x) => x.title)).toEqual(["New", "Old"]);
    expect(n[1]!.summary).toBe("Price fell.");
  });
});

describe("recent pool trades", () => {
  const POOL = "BTC.BTC";
  const action = (status: string, inAsset: string, inAmt: number, outs: [string, number][], prices: { in: number; out: number }, date = 1_795_179_635_968_753_215) => ({
    status, type: "swap", date: String(date),
    in: [{ txID: "ABC", coins: [{ asset: inAsset, amount: String(inAmt * 1e8) }] }],
    out: outs.map(([a, n]) => ({ coins: [{ asset: a, amount: String(n * 1e8) }] })),
    metadata: { swap: { inPriceUSD: String(prices.in), outPriceUSD: String(prices.out) } },
  });
  test("selling BTC into the pool is a sell at THORChain's in-price", () => {
    const [t] = parsePoolTrades({ actions: [action("success", POOL, 0.5, [["ETH.ETH", 17]], { in: 62_000, out: 1_740 })] }, POOL);
    expect(t).toMatchObject({ side: "sell", price: 62_000, amount: 0.5, usd: 31_000 });
    expect(t!.at).toBe(1_795_179_635_968);
  });
  test("taking BTC out of the pool is a buy at the out-price", () => {
    const [t] = parsePoolTrades({ actions: [action("success", "ETH.ETH", 17, [[POOL, 0.5], ["THOR.RUNE", 0.1]], { in: 1_740, out: 62_100 })] }, POOL);
    expect(t).toMatchObject({ side: "buy", price: 62_100, amount: 0.5 });
  });
  test("unfinished swaps are left out", () => {
    expect(parsePoolTrades({ actions: [action("pending", POOL, 1, [], { in: 62_000, out: 1 })] }, POOL)).toEqual([]);
  });
});

describe("cost by size", () => {
  test("average price and how much worse than the pool price", () => {
    const r = costRow(10_000, 0.16, 62_000, 35, 600, null);
    expect(r.avgPrice).toBe(62_500);
    expect(r.slipPct).toBeCloseTo(0.806, 3);
    expect(r.feePct).toBe(0.35);
    expect(r.minutes).toBe(10);
  });
  test("no quote keeps the reason", () => {
    expect(costRow(100, null, 62_000, null, null, "Paused")).toMatchObject({ out: null, error: "Paused" });
  });
});

describe("YouTube links", () => {
  test("reads every normal link shape", () => {
    for (const u of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30",
      "https://youtu.be/dQw4w9WgXcQ?si=x",
      "youtube.com/shorts/dQw4w9WgXcQ",
      "https://m.youtube.com/live/dQw4w9WgXcQ",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    ]) expect(youtubeId(u)).toBe("dQw4w9WgXcQ");
  });
  test("refuses other sites and broken ids", () => {
    expect(youtubeId("https://vimeo.com/123")).toBeNull();
    expect(youtubeId("https://evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeId("https://www.youtube.com/watch?v=short")).toBeNull();
  });
});

describe("recent trades lookup windows", () => {
  test("a window with room to spare and enough trades is used", () => {
    expect(tradeStep(30, 1, 5)).toBe("use");
    expect(tradeStep(5, 0, 0)).toBe("widen");
  });
  test("a full first window is all-recent and used", () => {
    expect(tradeStep(50, 0, 0)).toBe("use");
  });
  test("a full later window would skip trades, so the smaller complete one wins", () => {
    expect(tradeStep(50, 2, 8)).toBe("use-previous");
    expect(tradeStep(50, 2, 0)).toBe("slow");
  });
  test("a quiet pool uses whatever the widest window found, or the slow search when empty", () => {
    expect(tradeStep(3, 3, 1)).toBe("use");
    expect(tradeStep(0, 3, 0)).toBe("slow");
  });
});
