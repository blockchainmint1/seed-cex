import { describe, expect, test } from "bun:test";
import { DEFAULT_TIERS, earnedTier, memberLimits, missingFor, nextLevelText, tiersProblem, type WithdrawHistory } from "./withdraw-limits";

const fresh: WithdrawHistory = { accountDays: 0, withdrawals: 0, withdrawnUsd: 0, trades: 0 };

describe("withdrawal levels", () => {
  test("a brand-new member starts on level 1: $100 each, $250 a day, 48-hour wait", () => {
    const l = memberLimits(DEFAULT_TIERS, fresh, null)!;
    expect(l.tier.level).toBe(1);
    expect([l.perWithdrawalUsd, l.dailyUsd, l.holdHours]).toEqual([100, 250, 48]);
    expect(l.source).toBe("earned");
  });

  test("30 days and 3 withdrawals earns level 2 ($250 / $1,000, 24 hours)", () => {
    const l = memberLimits(DEFAULT_TIERS, { accountDays: 30, withdrawals: 3, withdrawnUsd: 0, trades: 0 }, null)!;
    expect(l.tier.level).toBe(2);
    expect([l.perWithdrawalUsd, l.dailyUsd, l.holdHours]).toEqual([250, 1000, 24]);
  });

  test("29 days is not enough for level 2 even with many withdrawals", () => {
    expect(earnedTier(DEFAULT_TIERS, { accountDays: 29, withdrawals: 50, withdrawnUsd: 50_000, trades: 50 })!.level).toBe(1);
  });

  test("levels are climbed in order: meeting level 4's numbers but not level 3's dollars stays on 2", () => {
    const tiers = DEFAULT_TIERS.map((t) => (t.level === 3 ? { ...t, minWithdrawnUsd: 20_000 } : t));
    expect(earnedTier(tiers, { accountDays: 200, withdrawals: 30, withdrawnUsd: 15_000, trades: 10 })!.level).toBe(2);
  });

  test("tells the member what's missing for the next level", () => {
    expect(missingFor(DEFAULT_TIERS[1], { accountDays: 18, withdrawals: 1, withdrawnUsd: 0, trades: 0 })).toEqual(["12 more days on Seeds", "2 more completed withdrawals"]);
    expect(nextLevelText(memberLimits(DEFAULT_TIERS, fresh, null)!)).toContain("Regular");
  });

  test("an admin-set level replaces the earned one, both up and down", () => {
    expect(memberLimits(DEFAULT_TIERS, fresh, { tierLevel: 3, frozen: false, note: "known member" })!.perWithdrawalUsd).toBe(1000);
    const down = memberLimits(DEFAULT_TIERS, { accountDays: 400, withdrawals: 40, withdrawnUsd: 40_000, trades: 20 }, { tierLevel: 1, frozen: false, note: "review" })!;
    expect(down.tier.level).toBe(1);
    expect(down.source).toBe("admin");
    expect(down.next).toBeNull();
  });

  test("an admin-set level that was deleted falls back to the highest level below it", () => {
    expect(memberLimits(DEFAULT_TIERS.slice(0, 2), fresh, { tierLevel: 4, frozen: false, note: "x" })!.tier.level).toBe(2);
  });

  test("a paused member is marked frozen", () => {
    expect(memberLimits(DEFAULT_TIERS, fresh, { tierLevel: null, frozen: true, note: "hacked?" })!.frozen).toBe(true);
  });

  test("no levels at all means no withdrawals (fail closed)", () => {
    expect(memberLimits([], fresh, null)).toBeNull();
  });
});

describe("saving levels", () => {
  test("the starting levels are valid", () => expect(tiersProblem(DEFAULT_TIERS)).toBeNull());
  test("level 1 can't have requirements", () =>
    expect(tiersProblem([{ ...DEFAULT_TIERS[0], minAccountDays: 1 }])).toContain("Level 1"));
  test("a higher level can't allow less", () =>
    expect(tiersProblem([DEFAULT_TIERS[0], { ...DEFAULT_TIERS[1], perWithdrawalUsd: 50 }])).toContain("at least as much as level 1"));
  test("a higher level can't ask for less history", () =>
    expect(tiersProblem([DEFAULT_TIERS[0], DEFAULT_TIERS[1], { ...DEFAULT_TIERS[2], minAccountDays: 10 }])).toContain("history"));
  test("daily must cover one withdrawal", () =>
    expect(tiersProblem([{ ...DEFAULT_TIERS[0], dailyUsd: 50 }])).toContain("daily"));
  test("no gaps in numbering", () =>
    expect(tiersProblem([DEFAULT_TIERS[0], DEFAULT_TIERS[2]])).toContain("no gaps"));
  test("hard ceilings: $100,000 each, $250,000 a day, 24–168 hours", () => {
    expect(tiersProblem([{ ...DEFAULT_TIERS[0], perWithdrawalUsd: 100_001, dailyUsd: 200_000 }])).toContain("$100,000");
    expect(tiersProblem([{ ...DEFAULT_TIERS[0], dailyUsd: 250_001 }])).toContain("$250,000");
    expect(tiersProblem([{ ...DEFAULT_TIERS[0], holdHours: 23 }])).toContain("24–168");
    expect(tiersProblem([{ ...DEFAULT_TIERS[0], holdHours: 24 }])).toBeNull();
    expect(tiersProblem([{ ...DEFAULT_TIERS[0], holdHours: 169 }])).toContain("24–168");
  });
  test("at most 6 levels", () =>
    expect(tiersProblem(Array.from({ length: 7 }, (_, i) => ({ ...DEFAULT_TIERS[0], level: i + 1 })))).toContain("6"));
});
