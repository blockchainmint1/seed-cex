import type { Series } from "./series";

export type TheoryResult = {
  id: string; title: string; idea: string; horizon: number;
  occurrences: number; avgAfter: number; baseline: number; hitRate: number; baseHit: number;
  firstHalfEdge: number; secondHalfEdge: number; verdict: "Held up" | "Weak" | "Did not hold" | "Too few cases";
};

const ma = (c: number[], i: number, n: number) => { if (i < n - 1) return NaN; let s = 0; for (let j = i - n + 1; j <= i; j++) s += c[j]!; return s / n; };
const ret = (c: number[], i: number, h: number) => (i + h < c.length ? c[i + h]! / c[i]! - 1 : NaN);
const maxBack = (c: number[], i: number, n: number) => { let m = -Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.max(m, c[j]!); return m; };

type Def = { id: string; title: string; idea: string; horizon: number; when: (c: number[], i: number, ctx: Ctx) => boolean };
type Ctx = { days: string[]; btc?: Map<string, number> | undefined };

export const THEORIES: Def[] = [
  { id: "three-red", title: "Three red days bounce", idea: "After 3 down days in a row, the next week tends to recover.", horizon: 7,
    when: (c, i) => i >= 3 && c[i]! < c[i - 1]! && c[i - 1]! < c[i - 2]! && c[i - 2]! < c[i - 3]! },
  { id: "crash-day", title: "Buy the crash day", idea: "After a single day falling more than 10%, prices rebound over the next week.", horizon: 7,
    when: (c, i) => i >= 1 && c[i]! / c[i - 1]! - 1 < -0.1 },
  { id: "pump-day", title: "Pumps keep going", idea: "After a single day rising more than 10%, the rally continues for a week.", horizon: 7,
    when: (c, i) => i >= 1 && c[i]! / c[i - 1]! - 1 > 0.1 },
  { id: "cross-50", title: "Back above the 50-day line", idea: "When price climbs back above its 50-day average, an uptrend follows.", horizon: 14,
    when: (c, i) => i >= 50 && c[i]! > ma(c, i, 50) && c[i - 1]! <= ma(c, i - 1, 50) },
  { id: "golden-cross", title: "Golden cross", idea: "When the 50-day average crosses above the 200-day average, the next month is strong.", horizon: 30,
    when: (c, i) => i >= 200 && ma(c, i, 50) > ma(c, i, 200) && ma(c, i - 1, 50) <= ma(c, i - 1, 200) },
  { id: "below-200", title: "Cheap below the 200-day line", idea: "Days spent below the 200-day average are good long-term entry points.", horizon: 30,
    when: (c, i) => i >= 199 && c[i]! < ma(c, i, 200) },
  { id: "breakout", title: "New 30-day high breakout", idea: "Closing at a fresh 30-day high leads to more gains next week.", horizon: 7,
    when: (c, i) => i >= 30 && c[i]! >= maxBack(c, i, 30) && c[i - 1]! < maxBack(c, i - 1, 30) },
  { id: "deep-dip", title: "30% off the recent high", idea: "After falling 30% from the 30-day high, the next month recovers.", horizon: 30,
    when: (c, i) => i >= 30 && c[i]! / maxBack(c, i, 30) - 1 < -0.3 },
  { id: "monday", title: "Monday effect", idea: "Buying at Sunday's close and holding through Monday beats an average day.", horizon: 1,
    when: (_c, i, ctx) => new Date(`${ctx.days[i]}T00:00:00Z`).getUTCDay() === 0 },
  { id: "btc-leads", title: "Bitcoin leads the pack", idea: "After Bitcoin rises 10%+ in a week, this coin rises the following week.", horizon: 7,
    when: (_c, i, ctx) => { if (!ctx.btc || i < 7) return false; const a = ctx.btc.get(ctx.days[i]!); const b = ctx.btc.get(ctx.days[i - 7]!); return !!a && !!b && a / b - 1 > 0.1; } },
];

function stats(c: number[], idx: number[], h: number) {
  const r = idx.map((i) => ret(c, i, h)).filter(Number.isFinite);
  return { n: r.length, avg: r.length ? r.reduce((s, x) => s + x, 0) / r.length : NaN, hit: r.length ? r.filter((x) => x > 0).length / r.length : NaN };
}

export function evaluateTheories(s: Series, btc?: Series): TheoryResult[] {
  const c = s.closes; const ctx: Ctx = { days: s.days, btc: btc ? new Map(btc.days.map((d, i) => [d, btc.closes[i]!] as [string, number])) : undefined };
  const all = c.map((_, i) => i); const mid = Math.floor(c.length / 2);
  return THEORIES.map((t) => {
    const hits = all.filter((i) => t.when(c, i, ctx));
    const sig = stats(c, hits, t.horizon); const base = stats(c, all, t.horizon);
    const edgeIn = (lo: number, hi: number) => stats(c, hits.filter((i) => i >= lo && i < hi), t.horizon).avg - stats(c, all.filter((i) => i >= lo && i < hi), t.horizon).avg;
    const e1 = edgeIn(0, mid); const e2 = edgeIn(mid, c.length);
    const edge = sig.avg - base.avg;
    const verdict: TheoryResult["verdict"] = sig.n < 10 ? "Too few cases"
      : edge > 0 && e1 > 0 && e2 > 0 && sig.hit >= base.hit ? "Held up"
      : edge > 0 ? "Weak" : "Did not hold";
    return { id: t.id, title: t.title, idea: t.idea, horizon: t.horizon, occurrences: sig.n, avgAfter: sig.avg, baseline: base.avg,
      hitRate: sig.hit, baseHit: base.hit, firstHalfEdge: e1, secondHalfEdge: e2, verdict };
  });
}
