/**
 * Plan tester (from Crypto Fortune Teller) — pure, browser- and server-safe.
 * Two kinds of plan:
 *  - "momentum": every check, hold the strongest coins (Fortune Teller's rule).
 *  - "basket": hold fixed target weights (e.g. BTC/ETH/LTC) and rebalance
 *    on schedule, optionally only when a coin drifts past a band.
 * Every decision uses only prices up to that day. Unallocated money is TSD ($1).
 */
import type { Series } from "./series";

export type PlanMode = "momentum" | "basket";
export type PlanSettings = {
  mode: PlanMode;
  coins: string[]; start: string; end: string;
  /** basket mode: target % per coin (missing/empty = equal split). */
  weights: Record<string, number>;
  /** basket mode: only rebalance when a coin is this many % points off target (0 = every check). */
  drift: number;
  rebalance: "daily" | "weekly" | "monthly";
  lookback: number; topK: number; trendMA: number; // 0 = off
  cap: number; reserve: number; feeBps: number; stopLoss: number; // % ; 0 = off
  holdout: number; // % of period held back for out-of-sample check
  amount: number; weeklyAdd: number; // starting money and regular weekly top-up
};
export const defaultPlan: PlanSettings = {
  mode: "basket", weights: {}, drift: 5,
  coins: ["bitcoin", "ethereum", "litecoin"], start: "2021-01-01", end: "", rebalance: "weekly",
  lookback: 30, topK: 2, trendMA: 50, cap: 50, reserve: 0, feeBps: 10, stopLoss: 0, holdout: 30, amount: 500, weeklyAdd: 0,
};

export type Point = { day: string; plan: number; hold: number; btc: number; cash: number };
export type Summary = { totalIn: number; finalValue: number; totalReturn: number; maxDrawdown: number; trades: number; fees: number; daysInCash: number };
export type Change = { day: string; before: Record<string, number>; after: Record<string, number>; value: number };
export type PlanRun = { changes: Change[]; points: Point[]; plan: Summary; hold: Summary; btc: Summary; split?: string; inSample?: [number, number]; outSample?: [number, number]; log: { day: string; picks: string; reason: string }[]; current?: Record<string, number>; error?: string };

const START = 10000;
// TSD (held at $1) is the "go to cash" option: never ranked, it takes whatever the coin picks leave over.
export const STABLES = { tsd: "TSD" } as const;
export const isStable = (id: string) => id in STABLES;
export const stableSeries = (days: string[]): Series => ({ days, closes: days.map(() => 1) });
const isTopUp = (i: number) => i > 0 && i % 7 === 0;

// vals = money value; idx = growth index excluding top-ups (for a fair worst-drop figure)
function summarise(vals: number[], idx: number[], totalIn = START, trades = 0, fees = 0, daysInCash = 0): Summary {
  let peak = -Infinity, dd = 0;
  for (const v of idx) { peak = Math.max(peak, v); dd = Math.min(dd, v / peak - 1); }
  const f = vals.at(-1) ?? totalIn;
  return { totalIn, finalValue: f, totalReturn: f / totalIn - 1, maxDrawdown: dd, trades, fees, daysInCash };
}

const isRebalance = (d: string, prev: string | undefined, r: PlanSettings["rebalance"]) =>
  !prev || r === "daily" || (r === "weekly" ? new Date(`${d}T00:00:00Z`).getUTCDay() === 1 : d.slice(0, 7) !== prev.slice(0, 7));

/** Basket targets as fractions of the invested part, normalised to 1. */
export function basketTargets(s: Pick<PlanSettings, "coins" | "weights">): Record<string, number> {
  const coins = s.coins.filter((id) => !isStable(id));
  const raw = coins.map((id) => Math.max(0, Number(s.weights?.[id]) || 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  return Object.fromEntries(coins.map((id, i) => [id, sum > 0 ? raw[i]! / sum : 1 / coins.length]));
}

export function runPlan(series: Record<string, Series>, s: PlanSettings, opts: { minDays?: number } = {}): PlanRun {
  const empty = { changes: [], points: [], plan: summarise([], []), hold: summarise([], []), btc: summarise([], []), log: [] };
  s = { ...defaultPlan, ...s, weights: s.weights ?? {} };
  const btc = series["bitcoin"];
  if (!btc || !s.coins.length) return { ...empty, error: "Pick at least one coin." };
  const maps = Object.fromEntries(s.coins.map((id) => [id, new Map(series[id]?.days.map((d, i) => [d, series[id]!.closes[i]]) ?? [])]));
  const btcMap = new Map(btc.days.map((d, i) => [d, btc.closes[i]]));
  const days = btc.days.filter((d) => d >= s.start && (!s.end || d <= s.end));
  if (days.length < (opts.minDays ?? 30)) return { ...empty, error: "Choose a longer date range (at least 30 days of history)." };
  const allDays = btc.days; const pos = new Map(allDays.map((d, i) => [d, i]));
  const priceAt = (id: string, d: string) => maps[id]!.get(d);
  const back = (d: string, n: number) => allDays[(pos.get(d) ?? 0) - n];
  const avg = (id: string, d: string, n: number) => { let sum = 0; for (let k = 0; k < n; k++) { const p = priceAt(id, back(d, k)!); if (!p) return NaN; sum += p; } return sum / n; };

  const amount = s.amount > 0 ? s.amount : START; const add = Math.max(0, s.weeklyAdd || 0);
  let weights: Record<string, number> = {}; let value = amount; let idx = 1; let totalIn = amount; let trades = 0; let fees = 0; let cashDays = 0;
  const entryPeak: Record<string, number> = {};
  const changes: Change[] = []; const planVals: number[] = []; const planIdx: number[] = []; const log: PlanRun["log"] = [];
  const stable = s.coins.find(isStable); const ranked = s.coins.filter((id) => !isStable(id));
  const holdCoins = ranked.filter((id) => priceAt(id, days[0]!));
  const holdBase = Object.fromEntries(holdCoins.map((id) => [id, priceAt(id, days[0]!)!]));
  const points: Point[] = [];
  // buy-and-hold and Bitcoin comparisons get the same money on the same days
  const holdUnits: Record<string, number> = Object.fromEntries(holdCoins.map((id) => [id, amount / holdCoins.length / holdBase[id]!]));
  let btcUnits = amount / btcMap.get(days[0]!)!; let holdIdx = 1, btcIdx = 1; const holdI: number[] = [], btcI: number[] = [];
  let prevHold = amount, prevBtc = amount;

  days.forEach((d, i) => {
    if (i > 0) {
      const prev = days[i - 1]; let growth = 0; let cashW = 1;
      for (const [id, w] of Object.entries(weights)) {
        const a = priceAt(id, prev!), b = priceAt(id, d);
        growth += w * (a && b ? b / a : 1); cashW -= w;
      }
      value *= growth + cashW; idx *= growth + cashW;
      // trailing stop: drift weights and check stops
      const total = growth + cashW;
      for (const id of Object.keys(weights)) {
        const a = priceAt(id, prev!), b = priceAt(id, d);
        weights[id] = (weights[id]! * (a && b ? b / a : 1)) / total;
        if (b) entryPeak[id] = Math.max(entryPeak[id] ?? b, b);
        if (s.stopLoss > 0 && b && b / entryPeak[id]! - 1 <= -s.stopLoss / 100) {
          const cost = weights[id] * value * (s.feeBps / 10000); value -= cost; idx *= 1 - cost / (value + cost); fees += cost; trades++;
          log.push({ day: d, picks: `sold ${id}`, reason: `Fell ${s.stopLoss}% from its high since buying` });
          const before = { ...weights }; delete weights[id]; delete entryPeak[id];
          changes.push({ day: d, before, after: { ...weights }, value });
        }
      }
      if (add > 0 && isTopUp(i)) {
        for (const id of Object.keys(weights)) weights[id] = weights[id]! * value / (value + add);
        value += add; totalIn += add;
      }
    }
    if (s.mode === "basket" && isRebalance(d, days[i - 1], s.rebalance)) {
      const invest = 1 - s.reserve / 100;
      const targets = basketTargets(s);
      const live = Object.fromEntries(Object.entries(targets).filter(([id]) => priceAt(id, d)));
      const liveSum = Object.values(live).reduce((a, b) => a + b, 0);
      const next: Record<string, number> = Object.fromEntries(Object.entries(live).map(([id, w]) => [id, liveSum > 0 ? (w / liveSum) * invest : 0]));
      const offBy = Math.max(0, ...[...new Set([...Object.keys(weights), ...Object.keys(next)])].map((id) => Math.abs((next[id] ?? 0) - (weights[id] ?? 0))));
      const first = !Object.keys(weights).length;
      if (first || s.drift <= 0 || offBy * 100 >= s.drift) {
        let turnover = 0;
        for (const id of new Set([...Object.keys(weights), ...Object.keys(next)])) {
          const ch = Math.abs((next[id] ?? 0) - (weights[id] ?? 0)); turnover += ch; if (ch > 1e-6) trades++;
        }
        const cost = turnover * value * (s.feeBps / 10000); value -= cost; if (value + cost > 0) idx *= 1 - cost / (value + cost); fees += cost;
        for (const id of Object.keys(next)) if (!weights[id]) entryPeak[id] = priceAt(id, d)!;
        if (turnover > 1e-6) log.push({ day: d, picks: Object.entries(next).map(([id, w]) => `${id} ${(w * 100).toFixed(0)}%`).join(", ") || "all cash",
          reason: first ? "Bought the basket" : `Rebalanced — a coin was ${(offBy * 100).toFixed(0)} points off target` });
        if (turnover > 1e-6) changes.push({ day: d, before: { ...weights }, after: { ...next }, value });
        weights = next;
      }
    } else if (s.mode !== "basket" && isRebalance(d, days[i - 1], s.rebalance)) {
      const scored = ranked.map((id) => {
        const now = priceAt(id, d), past = priceAt(id, back(d, s.lookback)!);
        if (!now || !past) return null;
        if (s.trendMA > 0 && !(now > avg(id, d, s.trendMA))) return null;
        return { id, score: now / past - 1 };
      }).filter((x): x is { id: string; score: number } => !!x && x.score > 0).sort((a, b) => b.score - a.score).slice(0, s.topK);
      const invest = 1 - s.reserve / 100;
      const each = scored.length ? Math.min(invest / scored.length, s.cap / 100) : 0;
      const next: Record<string, number> = Object.fromEntries(scored.map((x) => [x.id, each]));
      const leftover = invest - each * scored.length;
      if (stable && leftover > 1e-6) next[stable] = leftover;
      let turnover = 0;
      for (const id of new Set([...Object.keys(weights), ...Object.keys(next)])) {
        const ch = Math.abs((next[id] ?? 0) - (weights[id] ?? 0)); turnover += ch; if (ch > 1e-6) trades++;
      }
      const cost = turnover * value * (s.feeBps / 10000); value -= cost; if (value + cost > 0) idx *= 1 - cost / (value + cost); fees += cost;
      for (const x of scored) if (!weights[x.id]) entryPeak[x.id] = priceAt(x.id, d)!;
      if (turnover > 1e-6) log.push({ day: d, picks: [...scored.map((x) => `${x.id} ${(each * 100).toFixed(0)}%`), ...(stable && next[stable] ? [`${stable} ${(next[stable]! * 100).toFixed(0)}%`] : [])].join(", ") || "all cash",
        reason: scored.length ? `Strongest ${s.lookback}-day gains${s.trendMA ? ` and above ${s.trendMA}-day average` : ""}` : "No coin passed the rules" });
      if (turnover > 1e-6) changes.push({ day: d, before: { ...weights }, after: { ...next }, value });
      weights = next;
    }
    if (!Object.keys(weights).some((id) => !isStable(id))) cashDays++;
    planVals.push(value); planIdx.push(idx);
    const px = (id: string) => priceAt(id, d) ?? priceAt(id, days[i - 1] ?? d) ?? holdBase[id]!;
    let hold = holdCoins.length ? holdCoins.reduce((sum, id) => sum + holdUnits[id]! * px(id), 0) : totalIn;
    let btcV = btcUnits * btcMap.get(d)!;
    if (i > 0) { holdIdx *= hold / prevHold; btcIdx *= btcV / prevBtc; }
    if (add > 0 && isTopUp(i)) {
      for (const id of holdCoins) holdUnits[id]! += add / holdCoins.length / px(id);
      if (holdCoins.length) hold += add; else hold = totalIn;
      btcUnits += add / btcMap.get(d)!; btcV += add;
    }
    if (!holdCoins.length) hold = totalIn;
    prevHold = hold; prevBtc = btcV; holdI.push(holdIdx); btcI.push(btcIdx);
    points.push({ day: d, plan: value, hold, btc: btcV, cash: totalIn });
  });

  const run: PlanRun = {
    changes, points, log, current: { ...weights },
    plan: summarise(planVals, planIdx, totalIn, trades, fees, cashDays),
    hold: summarise(points.map((p) => p.hold), holdI, totalIn),
    btc: summarise(points.map((p) => p.btc), btcI, totalIn),
  };
  if (s.holdout > 0 && s.holdout < 90) {
    const k = Math.floor(points.length * (1 - s.holdout / 100));
    const ser = { plan: planIdx, hold: holdI };
    const seg = (a: number, b: number, key: "plan" | "hold") => ser[key][b]! / ser[key][a]! - 1;
    run.split = points[k]!.day;
    run.inSample = [seg(0, k, "plan"), seg(0, k, "hold")];
    run.outSample = [seg(k, points.length - 1, "plan"), seg(k, points.length - 1, "hold")];
  }
  return run;
}

export type Move = { coin: string; action: "buy" | "sell"; fromPct: number; toPct: number; usd: number };

/** Trades needed to go from current weights to target weights for a plan worth valueUsd. Ignores moves under minUsd. */
export function planMoves(current: Record<string, number>, target: Record<string, number>, valueUsd: number, minUsd = 1): Move[] {
  const out: Move[] = [];
  for (const coin of new Set([...Object.keys(current), ...Object.keys(target)])) {
    if (isStable(coin)) continue;
    const a = current[coin] ?? 0; const b = target[coin] ?? 0;
    const usd = Math.abs(b - a) * valueUsd;
    if (usd < minUsd) continue;
    out.push({ coin, action: b > a ? "buy" : "sell", fromPct: a * 100, toPct: b * 100, usd });
  }
  // sells first: they free up the TSD the buys need
  return out.sort((x, y) => (x.action === y.action ? y.usd - x.usd : x.action === "sell" ? -1 : 1));
}
