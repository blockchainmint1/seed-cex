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
  test("a connected AI assistant's token never counts as a fresh code (audit #3 A2)", () => {
    expect(freshTwoFactor({ ...withCode(60), client_id: "chatgpt-client" }, now)).toBe(false);
    expect(freshTwoFactor({ ...withCode(60), client_id: "" }, now)).toBe(true);
  });
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

import { withdrawLinkProblem, withdrawLinkState } from "./two-factor";
describe("withdrawals need a wallet link made after two-factor was on", () => {
  const on = Date.parse("2026-11-18T20:00:00Z");
  test("no two-factor: no withdrawals, even with a wallet linked", () =>
    expect(withdrawLinkState({ twoFactorSinceMs: null, linkCreatedMs: on })).toBe("needs_2fa"));
  test("wallet linked before two-factor was turned on: must re-link", () =>
    expect(withdrawLinkState({ twoFactorSinceMs: on, linkCreatedMs: on - 60_000 })).toBe("needs_relink"));
  test("linked at the very same moment doesn't count as after", () =>
    expect(withdrawLinkState({ twoFactorSinceMs: on, linkCreatedMs: on })).toBe("needs_relink"));
  test("wallet linked after two-factor was on: withdrawals allowed", () =>
    expect(withdrawLinkState({ twoFactorSinceMs: on, linkCreatedMs: on + 60_000 })).toBe("ready"));
  test("a new authenticator added after the link (lost phone, reset) means re-link again", () =>
    expect(withdrawLinkState({ twoFactorSinceMs: on + 3_600_000, linkCreatedMs: on + 60_000 })).toBe("needs_relink"));
  test("an unreadable link date never allows withdrawals", () =>
    expect(withdrawLinkState({ twoFactorSinceMs: on, linkCreatedMs: Number.NaN })).toBe("needs_relink"));
  test("the blocking messages tell the member what to do", () => {
    expect(withdrawLinkProblem("needs_2fa")).toContain("Turn it on");
    expect(withdrawLinkProblem("needs_relink")).toContain("Re-link");
    expect(withdrawLinkProblem("ready")).toBeNull();
  });
});

import { TELEGRAM_CODE_NEEDED, telegramChangeProblem } from "./two-factor";

describe("changing Telegram (audit #2 H1: code only, no wait)", () => {
  test("with two-factor on, connecting or unlinking needs a recent code", () => {
    expect(telegramChangeProblem({ on: true, fresh: false })).toBe(TELEGRAM_CODE_NEEDED);
    expect(telegramChangeProblem({ on: true, fresh: true })).toBeNull();
  });
  test("without two-factor there's no code to ask for", () => {
    expect(telegramChangeProblem({ on: false, fresh: false })).toBeNull();
  });
});
