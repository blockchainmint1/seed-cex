import { describe, expect, test as it } from "bun:test";
import { defaultPlan, stableSeries } from "./plan";
import { evaluateScenario, findPlaybooks, goalScore, playbookCandidates, rankPlaybooks, segmentStats, type Scenario } from "./playbook";

const days = Array.from({ length: 400 }, (_, i) => new Date(Date.UTC(2023, 0, 1 + i)).toISOString().slice(0, 10));
const flat = { days, closes: days.map(() => 100) };
// rises for the first 280 days, then falls hard in the newest part
const boomBust = { days, closes: days.map((_, i) => (i < 280 ? 100 * 1.005 ** i : 100 * 1.005 ** 280 * 0.99 ** (i - 280))) };
const base = { ...defaultPlan, coins: ["bitcoin"], start: days[0]!, end: "", amount: 500, feeBps: 25, holdout: 30, weeklyAdd: 0 };

describe("goal scores", () => {
  const s = { ret: 0.2, cagr: 0.2, dd: -0.3, years: 1 };
  it("Most growth = yearly growth", () => expect(goalScore("growth", s)).toBeCloseTo(0.2, 9));
  it("Balanced = growth minus worst drop", () => expect(goalScore("balanced", s)).toBeCloseTo(-0.1, 9));
  it("Smoothest ride counts the worst drop three times", () => expect(goalScore("smooth", s)).toBeCloseTo(-0.7, 9));
});

describe("scenarios tried", () => {
  it("one coin: 135 basket combinations, no 'strongest coin' plans", () => {
    const list = playbookCandidates(base);
    expect(list).toHaveLength(135);
    expect(list.every((s) => s.mode === "basket")).toBe(true);
  });
  it("never changes the member's coins, dates, money or trading cost", () => {
    const list = playbookCandidates({ ...base, coins: ["bitcoin", "ethereum", "litecoin"], amount: 750, feeBps: 40 });
    expect(list.length).toBeGreaterThan(135);
    for (const s of list) {
      expect(s.amount).toBe(750); expect(s.feeBps).toBe(40); expect(s.start).toBe(base.start);
      expect(s.coins.filter((c) => c !== "tsd")).toEqual(["bitcoin", "ethereum", "litecoin"]);
    }
  });
});

describe("honest scoring", () => {
  it("weekly top-ups never count as growth", () => {
    const r = evaluateScenario({ bitcoin: flat, tsd: stableSeries(days) }, { ...base, weeklyAdd: 100, feeBps: 0 }, 70)!;
    expect(r.scenario.whole.ret).toBeCloseTo(0, 9);
  });
  it("splits at 70% of the tested days for a 30% fresh slice", async () => {
    const res = (await findPlaybooks({ bitcoin: boomBust }, base))!;
    expect(res.split).toBe(days[Math.floor(400 * 0.7)]!);
  });
  it("picks only on the older part, then reports the fresh part separately", async () => {
    const res = (await findPlaybooks({ bitcoin: boomBust }, base))!;
    const ranked = rankPlaybooks(res.scenarios, "growth");
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1]!.older.cagr).toBeGreaterThanOrEqual(ranked[i]!.older.cagr);
    // the boom-then-bust coin: the fresh slice loses money for a plan that never goes to cash
    const noRules = res.scenarios.find((s) => s.settings.exitMA === 0 && s.settings.stopLoss === 0 && s.settings.reserve === 0 && s.settings.rebalance === "weekly")!;
    expect(noRules.older.ret).toBeGreaterThan(0);
    expect(noRules.fresh.ret).toBeLessThan(0);
  });
  it("'held up' means top third on the fresh data", () => {
    const mk = (key: string, older: number, fresh: number): Scenario => ({
      key, settings: base, older: { ret: older, cagr: older, dd: 0, years: 1 }, fresh: { ret: fresh, cagr: fresh, dd: 0, years: 1 }, whole: { ret: 0, cagr: 0, dd: 0, years: 1 },
      holdOlder: { ret: 0, cagr: 0, dd: 0, years: 1 }, holdFresh: { ret: 0, cagr: 0, dd: 0, years: 1 }, trades: 0, fees: 0, daysInCash: 0,
    });
    const r = rankPlaybooks([mk("a", 0.5, -0.2), mk("b", 0.3, 0.4), mk("c", 0.1, 0.1)], "growth");
    expect(r.map((x) => x.key)).toEqual(["a", "b", "c"]);
    expect(r[0]!.heldUp).toBe(false);
    expect(r[0]!.freshRank).toBe(3);
    expect(r[1]!.heldUp).toBe(true);
  });
  it("worst drop is measured from the highest point", () => {
    expect(segmentStats([100, 200, 100, 150], days, 0, 3).dd).toBeCloseTo(-0.5, 9);
  });
});
