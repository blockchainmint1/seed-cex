import { describe, expect, test } from "bun:test";
import { decisionKind, decisionMessage } from "./decision-message";

const base = { planName: "BTC 50-day", day: "2026-11-20", reasons: ["BTC is below its 50-day average ($63,068 vs $78,669)"], siteUrl: "https://seeds.honest.money/account/ai", oneTapLimit: 50 };

describe("which question the check asks", () => {
  test("selling a coin the plan now wants 0% of is the rule going to TSD", () => {
    expect(decisionKind({ rows: [{ side: "sell", coin: "bitcoin" }], targets: {}, waitingInTsd: true, canBuyNow: true })).toBe("sell-to-tsd");
  });
  test("a rebalancing sell (coin still wanted) is an ordinary trade day", () => {
    expect(decisionKind({ rows: [{ side: "sell", coin: "bitcoin" }, { side: "buy", coin: "ethereum" }], targets: { bitcoin: 0.5, ethereum: 0.5 }, waitingInTsd: false, canBuyNow: false })).toBe("trade");
  });
  test("no trades while the plan waits in TSD asks whether to stay or buy now", () => {
    expect(decisionKind({ rows: [], targets: {}, waitingInTsd: true, canBuyNow: true })).toBe("stay-in-tsd");
  });
  test("no trades and nothing waiting asks nothing", () => {
    expect(decisionKind({ rows: [], targets: { bitcoin: 1 }, waitingInTsd: false, canBuyNow: false })).toBeNull();
  });
});

describe("the message and its buttons", () => {
  test("sell-to-TSD under the one-tap limit: follow, override (keep holding) and skip all execute from Telegram", () => {
    const m = decisionMessage({ ...base, kind: "sell-to-tsd", holding: { tsd: 0, coins: [{ symbol: "BTC", units: 0.0005, usd: 31.5 }] }, rows: [{ side: "sell", symbol: "BTC", amount: 0.0005, usd: 31.5 }], total: 31.5, oneTap: true });
    expect(m.text).toContain("You hold 0.0005 BTC");
    expect(m.text).toContain("The rule says:</b> move to TSD");
    expect(m.buttons.flat().map((b) => ("choice" in b ? b.choice : "url"))).toEqual(["yes", "keep", "no"]);
  });
  test("over the limit, following the rule opens Seeds to confirm; the override still works from Telegram", () => {
    const m = decisionMessage({ ...base, kind: "sell-to-tsd", holding: { tsd: 0, coins: [{ symbol: "BTC", units: 0.008, usd: 500 }] }, rows: [{ side: "sell", symbol: "BTC", amount: 0.008, usd: 500 }], total: 500, oneTap: false });
    const flat = m.buttons.flat();
    expect("url" in flat[0]! && flat[0].url).toBe(base.siteUrl);
    expect("choice" in flat[1]! && flat[1].choice).toBe("keep");
  });
  test("stay-in-TSD: you're in TSD, the rule says stay; options are stay or buy now", () => {
    const m = decisionMessage({ ...base, kind: "stay-in-tsd", holding: { tsd: 500, coins: [] }, rows: [], total: 0, oneTap: false, buyNowTsd: 500 });
    expect(m.text).toContain("You're in TSD: 500 TSD");
    expect(m.text).toContain("stay in TSD. BTC is below its 50-day average ($63,068 vs $78,669)");
    expect(m.buttons.flat().map((b) => ("choice" in b ? b.choice : "url"))).toEqual(["no", "now"]);
  });
});
