import { describe, expect, test as it } from "bun:test";
import { basketTargets, defaultPlan, planMoves, runPlan, stableSeries } from "./plan";
import { evaluateTheories } from "./theories";

const days = Array.from({ length: 120 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10));
const up = { days, closes: days.map((_, i) => 100 * 1.01 ** i) };
const down = { days, closes: days.map((_, i) => 100 * 0.99 ** i) };
const flat = { days, closes: days.map(() => 100) };
const base = { ...defaultPlan, amount: 10000, mode: "momentum" as const, coins: ["bitcoin", "down"], start: days[0]!, end: "", lookback: 5, topK: 1, trendMA: 0, cap: 100, feeBps: 0, holdout: 0, rebalance: "daily" as const };

describe("momentum plan (Fortune Teller rules)", () => {
  it("never buys a coin with negative momentum", () => {
    expect(runPlan({ bitcoin: down, down }, base).plan.finalValue).toBe(10000);
  });
  it("charges the fee on every trade", () => {
    expect(runPlan({ bitcoin: up, down }, { ...base, feeBps: 100 }).plan.fees).toBeCloseTo(100, 0);
  });
  it("stop-loss sells after the set fall from the high", () => {
    const crash = { days, closes: days.map((_, i) => (i < 60 ? 100 * 1.01 ** i : 50)) };
    const run = runPlan({ bitcoin: crash, down }, { ...base, stopLoss: 20, rebalance: "monthly" });
    expect(run.log.some((l) => l.picks.startsWith("sold bitcoin"))).toBe(true);
  });
  it("adds the weekly top-up every 7 days", () => {
    expect(runPlan({ bitcoin: down, down }, { ...base, weeklyAdd: 100 }).plan.totalIn).toBe(11700);
  });
  it("parks money in TSD when no coin passes the rules", () => {
    const run = runPlan({ bitcoin: down, down, tsd: stableSeries(days) }, { ...base, coins: ["bitcoin", "down", "tsd"] });
    expect(run.log[0]!.picks).toBe("tsd 100%");
  });
  it("needs 30 days of history to test, but a live plan can run from day one", () => {
    const short = { ...base, start: days[110]! };
    expect(runPlan({ bitcoin: up, down }, short).error).toBeTruthy();
    expect(runPlan({ bitcoin: up, down }, short, { minDays: 1 }).error).toBeUndefined();
  });
});

describe("basket plan ($500 into BTC / ETH / LTC)", () => {
  const basket = { ...defaultPlan, mode: "basket" as const, coins: ["bitcoin", "ethereum", "litecoin"], start: days[0]!, end: "", amount: 500, feeBps: 0, holdout: 0, reserve: 0, stopLoss: 0, drift: 5, rebalance: "weekly" as const };
  it("splits evenly when no weights are given", () => {
    const t = basketTargets(basket);
    expect(t["bitcoin"]).toBeCloseTo(1 / 3, 9);
    expect(Object.keys(t)).toHaveLength(3);
  });
  it("uses the member's own weights", () => {
    const t = basketTargets({ coins: basket.coins, weights: { bitcoin: 50, ethereum: 30, litecoin: 20 } });
    expect(t["bitcoin"]).toBeCloseTo(0.5, 9);
    expect(t["litecoin"]).toBeCloseTo(0.2, 9);
  });
  it("gives blank coins an even share of what's left (BTC 60% → ETH 20%, LTC 20%)", () => {
    const t = basketTargets({ coins: basket.coins, weights: { bitcoin: 60 } });
    expect(t["bitcoin"]).toBeCloseTo(0.6, 9);
    expect(t["ethereum"]).toBeCloseTo(0.2, 9);
    expect(t["litecoin"]).toBeCloseTo(0.2, 9);
  });
  it("scales typed shares down when they add up to more than 100", () => {
    const t = basketTargets({ coins: basket.coins, weights: { bitcoin: 90, ethereum: 60 } });
    expect(t["bitcoin"]).toBeCloseTo(0.6, 9);
    expect(t["ethereum"]).toBeCloseTo(0.4, 9);
    expect(t["litecoin"]).toBe(0);
  });
  it("keeps a typed 0% at zero", () => {
    const t = basketTargets({ coins: basket.coins, weights: { litecoin: 0 } });
    expect(t["litecoin"]).toBe(0);
    expect(t["bitcoin"]).toBeCloseTo(0.5, 9);
  });
  it("buys the basket on day one and keeps $500 when prices don't move", () => {
    const run = runPlan({ bitcoin: flat, ethereum: flat, litecoin: flat }, basket);
    expect(run.log[0]!.reason).toBe("Bought the basket");
    expect(run.plan.finalValue).toBeCloseTo(500, 6);
    expect(run.log).toHaveLength(1); // nothing drifted, so no rebalancing
  });
  it("rebalances once a coin drifts past the band", () => {
    const run = runPlan({ bitcoin: up, ethereum: flat, litecoin: flat }, basket);
    expect(run.log.some((l) => l.reason.startsWith("Rebalanced"))).toBe(true);
  });
  it("keeps the cash reserve in TSD", () => {
    const run = runPlan({ bitcoin: flat, ethereum: flat, litecoin: flat }, { ...basket, reserve: 10 });
    const held = Object.values(run.current ?? {}).reduce((a, b) => a + b, 0);
    expect(held).toBeCloseTo(0.9, 9);
  });
});

describe("daily moves", () => {
  it("lists sells before buys, in dollars", () => {
    const m = planMoves({ bitcoin: 0.5, litecoin: 0.5 }, { bitcoin: 0.5, ethereum: 0.5 }, 500);
    expect(m.map((x) => `${x.action} ${x.coin} ${x.usd}`)).toEqual(["sell litecoin 250", "buy ethereum 250"]);
  });
  it("skips dust under a dollar", () => {
    expect(planMoves({ bitcoin: 0.5 }, { bitcoin: 0.501 }, 500)).toHaveLength(0);
  });
});

describe("theories", () => {
  it("returns exactly 10 theories", () => {
    expect(evaluateTheories(up)).toHaveLength(10);
  });
});

describe("what changed today", () => {
  it("records the before/after weights of every trade day", () => {
    const run = runPlan({ bitcoin: flat, ethereum: flat, litecoin: flat }, { ...defaultPlan, mode: "basket", coins: ["bitcoin", "ethereum", "litecoin"], start: days[0]!, end: "", amount: 500, feeBps: 0, holdout: 0 });
    expect(run.changes).toHaveLength(1);
    expect(run.changes[0]!.before).toEqual({});
    expect(planMoves(run.changes[0]!.before, run.changes[0]!.after, run.changes[0]!.value).every((m) => m.action === "buy")).toBe(true);
  });
});

describe("daily Telegram check", () => {
  it("says what to do, in dollars, and links to review", async () => {
    const { dailyMessage } = await import("./daily-message");
    const text = dailyMessage({ planName: "Bobby <basket>", day: "2026-11-18", moves: [{ coin: "BTC", action: "buy", fromPct: 0, toPct: 33, usd: 166.67 }], hold: [], valueUsd: 500, commitTsd: 500, reviewUrl: "https://seeds.honest.money/ai", executionLive: false });
    expect(text).toContain("Based on your plan, we should:");
    expect(text).toContain("Buy BTC — about $166.67 (to 33%)");
    expect(text).toContain("Bobby &lt;basket&gt;");
    expect(text).toContain("Paper plan");
  });
});
