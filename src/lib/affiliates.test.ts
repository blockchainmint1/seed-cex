import { describe, expect, test } from "bun:test";
import { REFERRAL_WINDOW_MS, affiliateSort, cleanCode, fillDays, isAutomatedVisit, isSharing, periodDays, referralProblem, sortAffiliates, type AffiliateRow } from "./affiliates";

const now = Date.parse("2026-11-23T12:00:00Z");
const base = { code: "fletch", accountCreatedAt: "2026-11-22T12:00:00Z", alreadyRecorded: false, ownCode: null, nowMs: now };

describe("recording a referral", () => {
  test("a member who joined yesterday with a code is recorded", () => {
    expect(referralProblem(base)).toBeNull();
  });
  test("only within 7 days of joining", () => {
    expect(REFERRAL_WINDOW_MS).toBe(7 * 86_400_000);
    expect(referralProblem({ ...base, accountCreatedAt: "2026-11-15T11:59:00Z" })).toBe("not_new");
  });
  test("the first code wins", () => {
    expect(referralProblem({ ...base, alreadyRecorded: true })).toBe("already_recorded");
  });
  test("nobody refers themselves (any letter case)", () => {
    expect(referralProblem({ ...base, ownCode: "Fletch" })).toBe("own_code");
  });
  test("codes must look like Honest.Money codes", () => {
    expect(cleanCode(" sjms73 ")).toBe("sjms73");
    expect(cleanCode("bad code!")).toBeNull();
    expect(referralProblem({ ...base, code: null })).toBe("no_code");
  });
});

describe("invite clicks", () => {
  test("link previews and scripts don't count; a phone browser does", () => {
    expect(isAutomatedVisit("TelegramBot (like TwitterBot)")).toBe(true);
    expect(isAutomatedVisit("facebookexternalhit/1.1")).toBe(true);
    expect(isAutomatedVisit(null)).toBe(true);
    expect(isAutomatedVisit("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1")).toBe(false);
  });
});

const row = (p: Partial<AffiliateRow>): AffiliateRow => ({
  code: "a", ownerId: null, ownerName: null, linkSeenAt: null, clicksAll: 0, clicksPeriod: 0, signupsAll: 0, signupsPeriod: 0,
  activeMembers: 0, trades: 0, tradedValue: 0, swaps: 0, swapUsd: 0, ignitePaid: 0, igniteStarted: 0, ...p,
});

describe("dashboard", () => {
  test("periods are 7/30/90/365 days, default 30", () => {
    expect(periodDays(90)).toBe(90);
    expect(periodDays(12)).toBe(30);
  });
  test("busiest first, ties broken by all-time sign-ups then code", () => {
    const rows = [row({ code: "b", signupsPeriod: 1, signupsAll: 1 }), row({ code: "a", signupsPeriod: 1, signupsAll: 4 }), row({ code: "c", signupsPeriod: 3 })];
    expect(sortAffiliates(rows, "signupsPeriod").map((r) => r.code)).toEqual(["c", "a", "b"]);
    expect(affiliateSort("nonsense")).toBe("signupsPeriod");
  });
  test("sharing = clicked or brought someone in during the period", () => {
    expect(isSharing({ clicksPeriod: 0, signupsPeriod: 0 })).toBe(false);
    expect(isSharing({ clicksPeriod: 2, signupsPeriod: 0 })).toBe(true);
  });
  test("every day in the chart is present, gaps are zero", () => {
    const s = fillDays([{ day: "2026-11-22", total: 3, referred: 1 }], 3, now);
    expect(s).toEqual([{ day: "2026-11-21", total: 0, referred: 0 }, { day: "2026-11-22", total: 3, referred: 1 }, { day: "2026-11-23", total: 0, referred: 0 }]);
  });
});
