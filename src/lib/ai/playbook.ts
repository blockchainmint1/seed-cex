/**
 * "Find my playbook": tries a few hundred rule combinations on the member's own
 * coins and dates, then ranks them honestly.
 *
 * Honesty rule: candidates are ranked ONLY on the older part of the history.
 * The newest slice (the "fresh data") is never used to pick — it is only used
 * afterwards to show whether the pick still held up. Picking on the whole
 * history would just find whatever happened to fit the past best.
 *
 * Pure and browser-safe: the same runPlan engine as the tester, no network.
 */
import { defaultPlan, isStable, runPlan, type PlanSettings, type PlanRun } from "./plan";
import type { Series } from "./series";

export type Goal = "growth" | "balanced" | "smooth";
export const GOALS: { id: Goal; label: string; blurb: string }[] = [
  { id: "growth", label: "Most growth", blurb: "Highest yearly growth. Ignores how bumpy the ride was." },
  { id: "balanced", label: "Balanced", blurb: "Yearly growth minus the worst drop — growth that didn't cost a huge crash." },
  { id: "smooth", label: "Smoothest ride", blurb: "Worst drop counts three times as much as growth. Favors calm plans." },
];

/** Growth and worst drop for one stretch of days. cagr = yearly growth (plain growth when shorter than a year). */
export type Stats = { ret: number; cagr: number; dd: number; years: number };
export type Scenario = {
  key: string;
  settings: PlanSettings;
  /** Older part (used to pick) and fresh part (only used to check). */
  older: Stats; fresh: Stats; whole: Stats;
  holdOlder: Stats; holdFresh: Stats;
  trades: number; fees: number; daysInCash: number;
  /** true for the member's own current settings, shown for comparison. */
  mine?: boolean;
};
export type Ranked = Scenario & { score: number; rank: number; freshRank: number; heldUp: boolean };
export type PlaybookResult = { scenarios: Scenario[]; split: string; from: string; to: string; olderPct: number };

/** Fresh slice share used by the finder: the member's own setting when sensible, otherwise 30%. */
export const freshShare = (holdout: number) => (holdout >= 10 && holdout <= 60 ? holdout : 30);

export function segmentStats(vals: number[], days: string[], a: number, b: number): Stats {
  const start = vals[a]!, end = vals[b]!;
  let peak = -Infinity, dd = 0;
  for (let i = a; i <= b; i++) { peak = Math.max(peak, vals[i]!); dd = Math.min(dd, vals[i]! / peak - 1); }
  const ret = start > 0 ? end / start - 1 : 0;
  const years = (Date.parse(days[b]!) - Date.parse(days[a]!)) / (365.25 * 864e5);
  const cagr = years > 1 ? Math.sign(1 + ret) * Math.abs(1 + ret) ** (1 / years) - 1 : ret;
  return { ret, cagr, dd, years };
}

/** One number per goal; higher is better. Worst drop (dd) is negative, so adding it subtracts. */
export function goalScore(goal: Goal, s: Stats): number {
  if (goal === "growth") return s.cagr;
  if (goal === "balanced") return s.cagr + s.dd;
  return s.cagr + 3 * s.dd;
}

const uniq = (list: PlanSettings[]) => {
  const seen = new Set<string>(); const out: PlanSettings[] = [];
  for (const s of list) { const k = scenarioKey(s); if (!seen.has(k)) { seen.add(k); out.push(s); } }
  return out;
};
export function scenarioKey(s: PlanSettings): string {
  return s.mode === "basket"
    ? `b|${s.rebalance}|${s.exitMA}|${s.stopLoss}|${s.reserve}|${s.drift}`
    : `m|${s.rebalance}|${s.lookback}|${s.topK}|${s.trendMA}|${s.reserve}|${s.stopLoss}|${s.cap}`;
}

/**
 * Every combination the finder tries, built around the member's coins, dates,
 * money, shares and trading cost (those are never changed — only the rules are).
 */
export function playbookCandidates(base: PlanSettings): PlanSettings[] {
  const b: PlanSettings = { ...defaultPlan, ...base, weights: base.weights ?? {} };
  const coins = b.coins.filter((id) => !isStable(id));
  const out: PlanSettings[] = [];
  for (const rebalance of ["daily", "weekly", "monthly"] as const)
    for (const exitMA of [0, 20, 50, 100, 200])
      for (const stopLoss of [0, 15, 25])
        for (const reserve of [0, 10, 25])
          out.push({ ...b, mode: "basket", rebalance, exitMA, stopLoss, reserve });
  if (coins.length >= 2) {
    const momentumCoins = b.coins.includes("tsd") ? b.coins : [...b.coins, "tsd"];
    for (const rebalance of ["weekly", "monthly"] as const)
      for (const lookback of [14, 30, 60, 90])
        for (let topK = 1; topK <= Math.min(3, coins.length - 1 || 1); topK++)
          for (const trendMA of [0, 50, 100])
            for (const reserve of [0, 10])
              out.push({ ...b, coins: momentumCoins, mode: "momentum", rebalance, lookback, topK, trendMA, reserve, stopLoss: 0, cap: 100 });
  }
  return uniq(out);
}

/** Runs one candidate and splits it into the older (picking) and fresh (checking) parts. */
export function evaluateScenario(series: Record<string, Series>, s: PlanSettings, olderPct: number): { scenario: Scenario; split: string; from: string; to: string } | null {
  // Score on a pure growth line: no weekly top-ups, so a deposit never looks like a gain.
  const run: PlanRun = runPlan(series, { ...s, weeklyAdd: 0, holdout: 0 });
  if (run.error || run.points.length < 60) return null;
  const days = run.points.map((p) => p.day);
  const plan = run.points.map((p) => p.plan), hold = run.points.map((p) => p.hold);
  const last = days.length - 1;
  const k = Math.min(last - 20, Math.max(20, Math.floor(days.length * (olderPct / 100))));
  return {
    split: days[k]!, from: days[0]!, to: days[last]!,
    scenario: {
      key: scenarioKey(s), settings: s,
      older: segmentStats(plan, days, 0, k), fresh: segmentStats(plan, days, k, last), whole: segmentStats(plan, days, 0, last),
      holdOlder: segmentStats(hold, days, 0, k), holdFresh: segmentStats(hold, days, k, last),
      trades: run.plan.trades, fees: run.plan.fees, daysInCash: run.plan.daysInCash,
    },
  };
}

/**
 * Tries every candidate (plus the member's own settings). `pause` lets the
 * browser breathe between batches; `onProgress` reports how many are done.
 */
export async function findPlaybooks(
  series: Record<string, Series>, base: PlanSettings,
  opts: { onProgress?: (done: number, total: number) => void; pause?: () => Promise<void>; signal?: { cancelled: boolean }; batch?: number } = {},
): Promise<PlaybookResult | null> {
  const olderPct = 100 - freshShare(base.holdout);
  const list = playbookCandidates(base);
  const mineKey = scenarioKey(base);
  const scenarios: Scenario[] = [];
  let meta: { split: string; from: string; to: string } | null = null;
  const all = [...list, ...(list.some((s) => scenarioKey(s) === mineKey) ? [] : [base])];
  for (let i = 0; i < all.length; i++) {
    if (opts.signal?.cancelled) return null;
    const r = evaluateScenario(series, all[i]!, olderPct);
    if (r) { scenarios.push({ ...r.scenario, mine: r.scenario.key === mineKey }); meta ??= r; }
    if ((i + 1) % (opts.batch ?? 8) === 0) { opts.onProgress?.(i + 1, all.length); await opts.pause?.(); }
  }
  opts.onProgress?.(all.length, all.length);
  return meta ? { scenarios, split: meta.split, from: meta.from, to: meta.to, olderPct } : null;
}

/**
 * Ranks by the goal on the OLDER part only. freshRank says where the same
 * scenario landed on the fresh data; "held up" = still in the top third there.
 */
export function rankPlaybooks(scenarios: Scenario[], goal: Goal): Ranked[] {
  const byFresh = [...scenarios].sort((a, b) => goalScore(goal, b.fresh) - goalScore(goal, a.fresh));
  const freshPos = new Map(byFresh.map((s, i) => [s.key, i + 1]));
  const cut = Math.max(1, Math.ceil(scenarios.length / 3));
  return [...scenarios]
    .sort((a, b) => goalScore(goal, b.older) - goalScore(goal, a.older) || a.trades - b.trades)
    .map((s, i) => ({ ...s, score: goalScore(goal, s.older), rank: i + 1, freshRank: freshPos.get(s.key)!, heldUp: freshPos.get(s.key)! <= cut }));
}

/** Plain-words description of a scenario's rules. */
export function describeRules(s: PlanSettings, symbol: (id: string) => string): string {
  const parts: string[] = [];
  if (s.mode === "basket") {
    parts.push(`Hold the basket, check ${s.rebalance}`);
    if (s.exitMA > 0) parts.push(`sell a coin below its ${s.exitMA}-day average`);
    if (s.stopLoss > 0) parts.push(`${s.stopLoss}% stop-loss`);
  } else {
    const pool = s.coins.filter((id) => !isStable(id)).map(symbol).join("/");
    parts.push(`Hold the strongest ${s.topK} of ${pool} by ${s.lookback}-day gain, check ${s.rebalance}`);
    if (s.trendMA > 0) parts.push(`skip coins below their ${s.trendMA}-day average`);
    if (s.stopLoss > 0) parts.push(`${s.stopLoss}% stop-loss`);
  }
  if (s.reserve > 0) parts.push(`keep ${s.reserve}% in TSD`);
  if (s.mode === "basket" && !s.exitMA && !s.stopLoss && !s.reserve) parts.push("no cash rules");
  return parts.join(", ") + ".";
}
