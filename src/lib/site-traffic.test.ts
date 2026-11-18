import { describe, expect, test } from "bun:test";
import { clampDays, deviceFromUA, fillDays, isBotUA, isSameOriginRequest, normalizePath, referrerSource, shouldCountHost, sourceLabel } from "./site-traffic";

describe("which visits count", () => {
  test("only the live site counts, never the preview or localhost", () => {
    expect(shouldCountHost("seeds.honest.money")).toBe(true);
    expect(shouldCountHost("seeds-cex.lovable.app")).toBe(true);
    expect(shouldCountHost("id-preview--0ce4bcf5.lovable.app")).toBe(false);
    expect(shouldCountHost("localhost")).toBe(false);
    expect(shouldCountHost(null)).toBe(false);
  });
  test("bots and scripts are not counted", () => {
    expect(isBotUA("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBotUA("Mozilla/5.0 HeadlessChrome/120")).toBe(true);
    expect(isBotUA("")).toBe(true);
    expect(isBotUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile Safari")).toBe(false);
  });
  test("beacons from other websites are refused", () => {
    const req = (h: Record<string, string>) => new Request("https://seeds.honest.money/api/public/track", { headers: h });
    expect(isSameOriginRequest(req({ origin: "https://seeds.honest.money", "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOriginRequest(req({ origin: "https://evil.example" }))).toBe(false);
    expect(isSameOriginRequest(req({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOriginRequest(req({}))).toBe(false);
  });
});

describe("what is stored", () => {
  test("search terms are dropped and invite codes / long ids are hidden", () => {
    expect(normalizePath("/Ignite/?ref=bob#top")).toBe("/ignite");
    expect(normalizePath("/invite/mineTXC")).toBe("/invite/…");
    expect(normalizePath("/pay/caaf52265d82be7e2767ed9c55b7965048eae4bfd5ab5fee065046adc57e2dd1")).toBe("/pay/…");
    expect(normalizePath("/p2p/offer/3f2b1c9e-1111-4a4a-9b9b-123456789abc")).toBe("/p2p/offer/…");
    expect(normalizePath("/trade/tsd-txc")).toBe("/trade/tsd-txc");
    expect(normalizePath("/")).toBe("/");
  });
  test("sources: direct visits and Seeds itself are not a source", () => {
    expect(referrerSource(null)).toBe(null);
    expect(referrerSource("https://seeds.honest.money/ignite")).toBe(null);
    expect(referrerSource("https://www.honest.money/r/abc")).toBe("honest.money");
    expect(referrerSource("https://m.facebook.com/")).toBe("facebook.com");
    expect(referrerSource("android-app://com.google.android.gm/")).toBe("com.google.android.gm");
    expect(sourceLabel("com.google.android.gm")).toBe("Gmail app");
    expect(sourceLabel("")).toBe("Direct / typed in");
  });
  test("device and range", () => {
    expect(deviceFromUA("Mozilla/5.0 (iPad; CPU OS 17_0)")).toBe("tablet");
    expect(deviceFromUA("Mozilla/5.0 (Linux; Android 14) Mobile")).toBe("mobile");
    expect(deviceFromUA("Mozilla/5.0 (Windows NT 10.0)")).toBe("desktop");
    expect(clampDays(9999)).toBe(365);
    expect(clampDays("x")).toBe(30);
  });
});

describe("daily chart", () => {
  test("shows every day of the period, zero where nobody visited, in Texas time", () => {
    // 2026-11-19 03:00 UTC is still Nov 18 in Texas.
    const out = fillDays([{ day: "2026-11-17", v: 5 }], 3, new Date("2026-11-19T03:00:00Z"), (day) => ({ day, v: 0 }));
    expect(out).toEqual([{ day: "2026-11-16", v: 0 }, { day: "2026-11-17", v: 5 }, { day: "2026-11-18", v: 0 }]);
  });
});
