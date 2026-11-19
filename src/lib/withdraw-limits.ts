/**
 * Withdrawal levels (pure, tested; no I/O).
 *
 * Every member starts on level 1 and moves up automatically as their history
 * grows: account age, completed withdrawals, dollars withdrawn and completed
 * trades, and from level 2 up (by default) two-factor sign-in on Seeds. A level
 * that needs two-factor is never given to a member without it, not even by an
 * admin, so a stolen Honest.Money sign-in alone can't reach the higher limits.
 * An admin can put one member on a set level (up or down) or pause
 * their withdrawals, always with a note. The levels themselves are edited in
 * /admin/settings and stored in withdrawal_tiers; save_withdrawal_tiers in the
 * database re-checks the same shape rules as tiersProblem.
 */

export type WithdrawTier = {
  level: number;
  name: string;
  perWithdrawalUsd: number;
  dailyUsd: number;
  holdHours: number;
  minAccountDays: number;
  minWithdrawals: number;
  minWithdrawnUsd: number;
  minTrades: number;
  /** Member must have two-factor sign-in on Seeds. Level 1 never; once a level needs it, every higher level does. */
  requires2fa: boolean;
};

export type WithdrawHistory = { accountDays: number; withdrawals: number; withdrawnUsd: number; trades: number; twoFactor: boolean };
export type WithdrawOverride = { tierLevel: number | null; frozen: boolean; note: string } | null;

export const MAX_TIERS = 6;
export const LIMIT_CEILINGS = { perWithdrawalUsd: 100_000, dailyUsd: 250_000, holdHoursMin: 24, holdHoursMax: 168 } as const;

/** Starting levels; the database was seeded with the same values. Editable in /admin/settings. */
export const DEFAULT_TIERS: WithdrawTier[] = [
  { level: 1, name: "New", perWithdrawalUsd: 100, dailyUsd: 250, holdHours: 48, minAccountDays: 0, minWithdrawals: 0, minWithdrawnUsd: 0, minTrades: 0, requires2fa: false },
  { level: 2, name: "Regular", perWithdrawalUsd: 250, dailyUsd: 1000, holdHours: 24, minAccountDays: 30, minWithdrawals: 3, minWithdrawnUsd: 0, minTrades: 0, requires2fa: true },
  { level: 3, name: "Trusted", perWithdrawalUsd: 1000, dailyUsd: 5000, holdHours: 24, minAccountDays: 90, minWithdrawals: 10, minWithdrawnUsd: 1000, minTrades: 0, requires2fa: true },
  { level: 4, name: "Established", perWithdrawalUsd: 5000, dailyUsd: 20000, holdHours: 24, minAccountDays: 180, minWithdrawals: 25, minWithdrawnUsd: 10000, minTrades: 5, requires2fa: true },
];

export const TWO_FACTOR_MISSING = "turn on two-factor sign-in (Account → Security)";

const sorted = (t: WithdrawTier[]) => [...t].sort((a, b) => a.level - b.level);

/** Everything still missing for a level, in plain words. Empty when the member qualifies. */
export function missingFor(tier: WithdrawTier, h: WithdrawHistory): string[] {
  const out: string[] = [];
  const days = tier.minAccountDays - h.accountDays;
  if (days > 0) out.push(`${days} more day${days === 1 ? "" : "s"} on Seeds`);
  const w = tier.minWithdrawals - h.withdrawals;
  if (w > 0) out.push(`${w} more completed withdrawal${w === 1 ? "" : "s"}`);
  const usd = tier.minWithdrawnUsd - h.withdrawnUsd;
  if (usd > 0) out.push(`$${Math.ceil(usd).toLocaleString("en-US")} more withdrawn`);
  const tr = tier.minTrades - h.trades;
  if (tr > 0) out.push(`${tr} more completed trade${tr === 1 ? "" : "s"}`);
  if (tier.requires2fa && !h.twoFactor) out.push(TWO_FACTOR_MISSING);
  return out;
}

/** Highest level whose every requirement the member meets (level 1 has none). */
export function earnedTier(tiers: WithdrawTier[], h: WithdrawHistory): WithdrawTier | null {
  let best: WithdrawTier | null = null;
  for (const t of sorted(tiers)) {
    if (missingFor(t, h).length) break; // levels are cumulative; stop at the first one not met
    best = t;
  }
  return best;
}

export type MemberLimits = {
  tier: WithdrawTier;
  source: "earned" | "admin";
  frozen: boolean;
  note: string | null;
  perWithdrawalUsd: number;
  dailyUsd: number;
  holdHours: number;
  /** An admin set a level that needs two-factor but the member hasn't turned it on, so they get the highest level below it that doesn't. */
  waitingOnTwoFactor: WithdrawTier | null;
  /** The next level up from the earned one and what's missing; null at the top or when an admin set the level. */
  next: { tier: WithdrawTier; missing: string[] } | null;
};

/** The limits that apply to one member right now, or null when no levels exist (fail closed). */
export function memberLimits(tiers: WithdrawTier[], h: WithdrawHistory, o: WithdrawOverride): MemberLimits | null {
  const list = sorted(tiers);
  if (!list.length) return null;
  const earned = earnedTier(list, h) ?? list[0];
  let tier = earned;
  let source: "earned" | "admin" = "earned";
  let waitingOnTwoFactor: WithdrawTier | null = null;
  if (o?.tierLevel != null) {
    // An admin's level that no longer exists falls back to the highest level at or below it.
    const pick = [...list].reverse().find((t) => t.level <= o.tierLevel!) ?? list[0];
    tier = pick;
    source = "admin";
    // Two-factor is a hard rule: an admin can't hand a two-factor level to a member without it.
    if (pick.requires2fa && !h.twoFactor) {
      waitingOnTwoFactor = pick;
      tier = [...list].reverse().find((t) => t.level <= pick.level && !t.requires2fa) ?? list[0];
    }
  }
  const up = source === "earned" ? list.find((t) => t.level > earned.level) : undefined;
  return {
    tier, source, frozen: Boolean(o?.frozen), note: o?.note ?? null, waitingOnTwoFactor,
    perWithdrawalUsd: tier.perWithdrawalUsd, dailyUsd: tier.dailyUsd, holdHours: tier.holdHours,
    next: up ? { tier: up, missing: missingFor(up, h) } : null,
  };
}

/** Why a set of levels can't be saved, or null. Mirrors save_withdrawal_tiers. */
export function tiersProblem(tiers: WithdrawTier[]): string | null {
  if (tiers.length < 1) return "Keep at least one level.";
  if (tiers.length > MAX_TIERS) return `At most ${MAX_TIERS} levels.`;
  const list = sorted(tiers);
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const label = `Level ${t.level}`;
    if (t.level !== i + 1) return "Levels must be numbered 1, 2, 3… with no gaps.";
    const name = t.name.trim();
    if (!name || name.length > 40) return `${label} needs a name of 1–40 characters.`;
    const nums = [t.perWithdrawalUsd, t.dailyUsd, t.holdHours, t.minAccountDays, t.minWithdrawals, t.minWithdrawnUsd, t.minTrades];
    if (nums.some((n) => !Number.isFinite(n) || n < 0)) return `${label}: every number must be zero or more.`;
    if ([t.holdHours, t.minAccountDays, t.minWithdrawals, t.minTrades].some((n) => !Number.isInteger(n))) return `${label}: hours, days, withdrawals and trades must be whole numbers.`;
    if (t.perWithdrawalUsd <= 0) return `${label}: the per-withdrawal limit must be more than $0.`;
    if (t.perWithdrawalUsd > LIMIT_CEILINGS.perWithdrawalUsd) return `${label}: at most $${LIMIT_CEILINGS.perWithdrawalUsd.toLocaleString("en-US")} per withdrawal.`;
    if (t.dailyUsd > LIMIT_CEILINGS.dailyUsd) return `${label}: at most $${LIMIT_CEILINGS.dailyUsd.toLocaleString("en-US")} a day.`;
    if (t.dailyUsd < t.perWithdrawalUsd) return `${label}: the daily limit must be at least one full withdrawal.`;
    if (t.holdHours < LIMIT_CEILINGS.holdHoursMin || t.holdHours > LIMIT_CEILINGS.holdHoursMax) return `${label}: the wait must be 24–168 hours, so a member always has at least a day to cancel.`;
    if (i === 0 && (t.minAccountDays || t.minWithdrawals || t.minWithdrawnUsd || t.minTrades || t.requires2fa)) return "Level 1 is where every new member starts, so it can't have requirements.";
    if (i > 0) {
      const p = list[i - 1];
      if (t.perWithdrawalUsd < p.perWithdrawalUsd || t.dailyUsd < p.dailyUsd) return `${label} must allow at least as much as level ${p.level}.`;
      if (t.minAccountDays < p.minAccountDays || t.minWithdrawals < p.minWithdrawals || t.minWithdrawnUsd < p.minWithdrawnUsd || t.minTrades < p.minTrades)
        return `${label} must ask for at least as much history as level ${p.level}.`;
      if (p.requires2fa && !t.requires2fa) return `${label} must need two-factor sign-in, because level ${p.level} does.`;
    }
  }
  return null;
}

export const OVERRIDE_RESULT_MESSAGES: Record<string, string> = {
  ok: "Saved.",
  not_admin: "Only admins can change withdrawal limits.",
  self: "You can't change your own withdrawal limits. Ask another admin.",
  no_account: "That account doesn't exist.",
  need_note: "Add a short note (3–300 characters) saying why.",
  no_tier: "That level doesn't exist any more. Refresh and pick again.",
  unchanged: "Nothing to change.",
  bad_tiers: "Those levels couldn't be saved.",
};
export const overrideMessage = (code: string) => OVERRIDE_RESULT_MESSAGES[code] ?? "Something went wrong. Nothing was changed.";

/** Short member-facing sentence about the next level. */
export function nextLevelText(l: MemberLimits): string | null {
  if (l.waitingOnTwoFactor) return `The Seeds team set you to ${l.waitingOnTwoFactor.name}. Turn on two-factor sign-in (Account → Security) to use it.`;
  if (l.source === "admin" || !l.next) return null;
  const { tier, missing } = l.next;
  const up = `$${tier.perWithdrawalUsd.toLocaleString("en-US")} each, $${tier.dailyUsd.toLocaleString("en-US")} a day`;
  return missing.length ? `Next level, ${tier.name} (${up}): ${missing.join(", ")}.` : `You qualify for ${tier.name} (${up}).`;
}

/** Stand-in for "no limit" where the database wants a number. */
export const TESTER_NO_LIMIT_USD = 1e12;

/**
 * Bobby, Nov 19 2026: beta testers (and admins) withdraw with no Seeds amount limit and no hold.
 * Two-factor rules and an admin pause still apply — those protect the account, not the amount.
 */
export function testerLimits<T extends MemberLimits>(l: T): T {
  return { ...l, perWithdrawalUsd: TESTER_NO_LIMIT_USD, dailyUsd: TESTER_NO_LIMIT_USD, holdHours: 0 };
}
