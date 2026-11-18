import { describe, expect, test } from "bun:test";
import { CODE_MAX_AGE_SEC, cleanCode, freshTwoFactor, resetProblem, withdrawalTwoFactorProblem } from "./two-factor";

const now = 1_800_000_000;
const withCode = (secondsAgo: number) => ({ aal: "aal2", amr: [{ method: "otp", timestamp: now - 3600 }, { method: "totp", timestamp: now - secondsAgo }] });

describe("fresh authenticator code", () => {
  test("a code from 9 minutes ago counts; 11 minutes ago doesn't", () => {
    expect(CODE_MAX_AGE_SEC).toBe(600);
    expect(freshTwoFactor(withCode(9 * 60), now)).toBe(true);
    expect(freshTwoFactor(withCode(11 * 60), now)).toBe(false);
  });
  test("a plain Honest.Money sign-in (no code) never counts", () => {
    expect(freshTwoFactor({ aal: "aal1", amr: [{ method: "otp", timestamp: now }] }, now)).toBe(false);
    expect(freshTwoFactor({ aal: "aal2", amr: [{ method: "otp", timestamp: now }] }, now)).toBe(false);
    expect(freshTwoFactor(null, now)).toBe(false);
  });
  test("a code stamp but a session not at the second level doesn't count", () =>
    expect(freshTwoFactor({ aal: "aal1", amr: [{ method: "totp", timestamp: now }] }, now)).toBe(false));
  test("a stamp far in the future isn't trusted", () =>
    expect(freshTwoFactor(withCode(-3600), now)).toBe(false));
});

describe("withdrawals", () => {
  test("two-factor on: every withdrawal needs a fresh code", () => {
    expect(withdrawalTwoFactorProblem({ on: true, fresh: false, levelNeeds2fa: false })).toContain("6-digit");
    expect(withdrawalTwoFactorProblem({ on: true, fresh: true, levelNeeds2fa: true })).toBeNull();
  });
  test("two-factor off on level 1: no code needed", () =>
    expect(withdrawalTwoFactorProblem({ on: false, fresh: false, levelNeeds2fa: false })).toBeNull());
  test("a two-factor level without two-factor is refused", () =>
    expect(withdrawalTwoFactorProblem({ on: false, fresh: false, levelNeeds2fa: true })).toContain("needs two-factor"));
});

describe("admin reset", () => {
  const ok = { actorId: "a", targetId: "b", note: "called them on video", actorFresh: true, targetOn: true };
  test("allowed with a fresh admin code, a note and a member who has two-factor", () => expect(resetProblem(ok)).toBeNull());
  test("never on yourself", () => expect(resetProblem({ ...ok, targetId: "a" })).toContain("your own"));
  test("admin must have just entered their own code", () => expect(resetProblem({ ...ok, actorFresh: false })).toContain("authenticator code"));
  test("needs a 3–300 character note", () => {
    expect(resetProblem({ ...ok, note: "ok" })).toContain("note");
    expect(resetProblem({ ...ok, note: "x".repeat(301) })).toContain("note");
  });
});

describe("code box", () => {
  test("accepts 6 digits with spaces or a dash", () => {
    expect(cleanCode("123 456")).toBe("123456");
    expect(cleanCode("123-456")).toBe("123456");
  });
  test("rejects anything else", () => {
    expect(cleanCode("12345")).toBeNull();
    expect(cleanCode("1234567")).toBeNull();
    expect(cleanCode("12a456")).toBeNull();
  });
});
