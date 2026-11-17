import { describe, expect, test as it } from "bun:test";
import { cleanSettings, lockBlocker, LOCK_LIMITS } from "./lock-rules";
import { aiBuyable } from "./catalog";

const active = ["bitcoin", "ethereum", "litecoin"];
const ok = { name: "My basket", commitTsd: 500, settings: cleanSettings({ coins: active }, active), maxCommitTsd: 1000, activePlans: 0, missingPockets: [] };

describe("locking in a plan", () => {
  it("accepts $500 into BTC/ETH/LTC", () => expect(lockBlocker(ok)).toBeNull());
  it("refuses more than the admin limit", () => expect(lockBlocker({ ...ok, commitTsd: 1001 })).toContain("1,000 TSD"));
  it("refuses less than the minimum", () => expect(lockBlocker({ ...ok, commitTsd: LOCK_LIMITS.minCommitTsd - 1 })).toContain("at least"));
  it("refuses a 4th live plan", () => expect(lockBlocker({ ...ok, activePlans: 3 })).toContain("3 live plans"));
  it("refuses coins the member's pocket can't hold", () => expect(lockBlocker({ ...ok, missingPockets: ["Dogecoin"] })).toContain("Dogecoin"));
  it("drops coins that aren't switched on (e.g. SHIB)", () => {
    expect(cleanSettings({ coins: ["bitcoin", "shiba-inu"] }, active).coins).toEqual(["bitcoin"]);
  });
  it("clamps out-of-range numbers", () => {
    const s = cleanSettings({ coins: active, reserve: 500, stopLoss: -4, feeBps: 99999 }, active);
    expect([s.reserve, s.stopLoss, s.feeBps]).toEqual([90, 0, 500]);
  });
});

describe("which coins Seeds AI may offer", () => {
  it("offers BTC, ETH and LTC", () => expect(["BTC", "ETH", "LTC"].every(aiBuyable)).toBe(true));
  it("never offers coins without a THORChain route Seeds signs (Cardano, Maya-only)", () => {
    expect(aiBuyable("ADA")).toBe(false);
    expect(aiBuyable("SHIB")).toBe(false);
  });
});

describe("catalog", () => {
  it("every catalog coin is one Seeds can actually buy and sell back", async () => {
    const { AI_CATALOG } = await import("./catalog");
    expect(AI_CATALOG.filter((c) => !aiBuyable(c.swapCoin)).map((c) => c.swapCoin)).toEqual([]);
  });
});
