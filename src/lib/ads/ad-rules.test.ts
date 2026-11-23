import { describe, expect, test } from "bun:test";
import { adLabel, adsForSpot, houseAds, pickAds, safeAdLink, SPOT_INFO, clickRate, type Ad } from "./ad-rules";

const NOW = Date.parse("2026-11-21T12:00:00Z");
const ad = (over: Partial<Ad>): Ad => ({
  id: "00000000-0000-0000-0000-000000000001", spot: "home_spotlight", advertiser: "ZeroChill", advertiser_kind: "ecosystem",
  title: "ZCU", body: "", cta_label: "Go", link: "/trade/zcu-tsd", coin_slug: null, accent: "green",
  starts_at: "2026-11-01T00:00:00Z", ends_at: null, ...over,
});

describe("who may advertise", () => {
  test("only the ecosystem and coins listed on Seeds", () => {
    const outside = ad({ advertiser_kind: "outside" as never });
    expect(pickAds([outside], "home_spotlight", { nowMs: NOW })).toEqual([]);
    expect(pickAds([ad({ advertiser_kind: "listed_coin" })], "home_spotlight", { nowMs: NOW })).toHaveLength(1);
  });
});

describe("links", () => {
  test("Seeds pages and https addresses are allowed", () => {
    expect(safeAdLink("/flight-school/spark")).toBe("/flight-school/spark");
    expect(safeAdLink("https://texitcoin.org/build")).toBe("https://texitcoin.org/build");
  });
  test("unsafe links are refused", () => {
    for (const bad of ["javascript:alert(1)", "http://x.com", "//evil.com", "/\\evil.com", "data:text/html,x", "https://user:pw@x.com", "https://localhost", "ftp://x.com", ""]) {
      expect(safeAdLink(bad)).toBeNull();
    }
  });
});

describe("how many show", () => {
  test("homepage spotlight shows three cards, every other spot one", () => {
    expect(SPOT_INFO.home_spotlight.max).toBe(3);
    for (const s of ["markets_row", "coin_side", "coin_story", "coin_banner"] as const) expect(SPOT_INFO[s].max).toBe(1);
    const many = [1, 2, 3, 4, 5].map((n) => ad({ id: `0000000${n}` }));
    expect(pickAds(many, "home_spotlight", { nowMs: NOW })).toHaveLength(3);
  });
  test("paused, not-started and ended ads never show", () => {
    const list = [
      ad({ id: "a", starts_at: "2026-12-01T00:00:00Z" }),
      ad({ id: "b", ends_at: "2026-11-20T00:00:00Z" }),
      { ...ad({ id: "c" }), paused: true } as Ad,
    ];
    expect(pickAds(list, "home_spotlight", { nowMs: NOW })).toEqual([]);
  });
});

describe("coin pages", () => {
  test("an ad aimed at one coin only shows on that coin's page, and beats an every-coin ad", () => {
    const btc = ad({ id: "b", spot: "coin_side", coin_slug: "btc-tsd" });
    const all = ad({ id: "a", spot: "coin_side", coin_slug: null });
    expect(pickAds([btc, all], "coin_side", { coinSlug: "eth-tsd", nowMs: NOW }).map((x) => x.id)).toEqual(["a"]);
    expect(pickAds([btc, all], "coin_side", { coinSlug: "btc-tsd", nowMs: NOW }).map((x) => x.id)).toEqual(["b"]);
  });
});

describe("unsold spots", () => {
  test("homepage, side card and banner fall back to Seeds' own notes; markets row and story stay empty", () => {
    expect(adsForSpot([], "home_spotlight", { nowMs: NOW })).toHaveLength(3);
    expect(adsForSpot([], "coin_side", { coinSlug: "btc-tsd", nowMs: NOW })).toHaveLength(1);
    expect(adsForSpot([], "coin_banner", { coinSlug: "btc-tsd", nowMs: NOW })).toHaveLength(1);
    expect(adsForSpot([], "markets_row", { nowMs: NOW })).toEqual([]);
    expect(adsForSpot([], "coin_story", { coinSlug: "btc-tsd", nowMs: NOW })).toEqual([]);
  });
  test("paid ads come first and Seeds' notes fill the rest", () => {
    const shown = adsForSpot([ad({})], "home_spotlight", { nowMs: NOW });
    expect(shown.map((s) => s.house)).toEqual([false, true, true]);
    expect(shown.map(adLabel)).toEqual(["Sponsored", "From Seeds", "From Seeds"]);
  });
  test("Seeds' notes link only to Seeds pages, and the Flight School note ends after the class", () => {
    for (const s of ["home_spotlight", "coin_side", "coin_banner"] as const) {
      for (const h of houseAds(s, NOW)) expect(h.link.startsWith("/")).toBe(true);
    }
    const after = Date.parse("2026-12-06T00:00:00Z");
    expect(houseAds("home_spotlight", after).some((h) => h.link.startsWith("/flight-school"))).toBe(false);
    expect(houseAds("coin_banner", after)).toEqual([]);
  });
});

test("click rate", () => {
  expect(clickRate(0, 0)).toBeNull();
  expect(clickRate(200, 3)).toBe(1.5);
});
