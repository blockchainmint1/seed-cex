/**
 * Rules for locking in a Seeds AI plan (pure, tested). The server re-checks
 * everything here; the browser's copy is only for instant feedback.
 */
import { defaultPlan, type PlanSettings } from "./plan";

export const LOCK_LIMITS = { minCommitTsd: 10, maxCoins: 10, maxActivePlans: 3, nameMax: 60 } as const;

const clamp = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

/** Keep only known fields, within sane ranges, so a stored plan always runs the same way. */
export function cleanSettings(raw: Partial<PlanSettings>, activeCoins: string[]): PlanSettings {
  const coins = [...new Set((Array.isArray(raw.coins) ? raw.coins : []).filter((c): c is string => typeof c === "string" && activeCoins.includes(c)))];
  const weights: Record<string, number> = {};
  for (const c of coins) {
    const w = Number(raw.weights?.[c]);
    if (Number.isFinite(w) && w > 0) weights[c] = Math.min(100, w);
  }
  const mode = raw.mode === "momentum" ? "momentum" : "basket";
  const rebalance = raw.rebalance === "daily" || raw.rebalance === "monthly" ? raw.rebalance : "weekly";
  return {
    ...defaultPlan,
    mode, coins, weights, rebalance,
    start: defaultPlan.start, end: "",
    drift: clamp(raw.drift, 0, 50, defaultPlan.drift),
    lookback: Math.round(clamp(raw.lookback, 1, 365, defaultPlan.lookback)),
    topK: Math.round(clamp(raw.topK, 1, LOCK_LIMITS.maxCoins, defaultPlan.topK)),
    trendMA: Math.round(clamp(raw.trendMA, 0, 365, defaultPlan.trendMA)),
    cap: clamp(raw.cap, 1, 100, defaultPlan.cap),
    reserve: clamp(raw.reserve, 0, 90, defaultPlan.reserve),
    feeBps: clamp(raw.feeBps, 0, 500, defaultPlan.feeBps),
    stopLoss: clamp(raw.stopLoss, 0, 90, defaultPlan.stopLoss),
    holdout: 0, amount: 0, weeklyAdd: 0,
  };
}

/** First reason this plan can't be locked in, or null. */
export function lockBlocker(p: {
  name: string;
  commitTsd: number;
  settings: PlanSettings;
  maxCommitTsd: number;
  activePlans: number;
  missingPockets: string[];
}): string | null {
  const name = p.name.trim();
  if (!name) return "Give your plan a name.";
  if (name.length > LOCK_LIMITS.nameMax) return `Keep the name under ${LOCK_LIMITS.nameMax} characters.`;
  if (!Number.isFinite(p.commitTsd) || p.commitTsd < LOCK_LIMITS.minCommitTsd) return `Commit at least ${LOCK_LIMITS.minCommitTsd} TSD.`;
  if (p.commitTsd > p.maxCommitTsd) return `Plans are limited to ${p.maxCommitTsd.toLocaleString("en-US")} TSD for now.`;
  if (!p.settings.coins.length) return "Pick at least one coin.";
  if (p.settings.coins.length > LOCK_LIMITS.maxCoins) return `Pick at most ${LOCK_LIMITS.maxCoins} coins.`;
  if (p.activePlans >= LOCK_LIMITS.maxActivePlans) return `You can have ${LOCK_LIMITS.maxActivePlans} live plans at a time. End one first.`;
  if (p.missingPockets.length) return `Your linked trading pocket doesn't hold ${p.missingPockets.join(", ")} yet. Link it in Profile, or take those coins out.`;
  return null;
}
