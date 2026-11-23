import { describe, expect, test } from "bun:test";
import {
  AGED_MS, FRESH_SIGNIN_SEC, INTENT_MAX_MS, STEP_UP_PER_HOUR, STEP_UP_TRIES, STEP_UP_TTL_MS,
  factorCounts, freshSignIn, freshTotpAfter, makeIntent, readIntent, recentSignIn, newFactorTrust, parseStepUpData, proofUsable, signInAgeSec, stepUpButtonData,
  stepUpOptions, stepUpPasses, stepUpSignatureOk, stepUpTapDecision, totpCounts, trusted,
} from "./rules";

const NOW_S = 1_800_000_000;
const NOW = NOW_S * 1000;
const DAY = 24 * 3600_000;
const ID = "11111111-2222-4333-8444-555555555555";
const USER = "99999999-8888-4777-8666-555555555555";

describe("fresh sign-in (option 1, offered first) — S1: must come after the request", () => {
  const SINCE = NOW_S - 120; // the held key / new factor / unlink screen appeared 2 minutes ago
  test("10 minutes is the limit (decisions note)", () => {
    expect(FRESH_SIGNIN_SEC).toBe(600);
    expect(freshSignIn({ amr: [{ method: "otp", timestamp: NOW_S - 600 }] }, NOW_S, NOW_S - 700)).toBe(true);
    expect(freshSignIn({ amr: [{ method: "otp", timestamp: NOW_S - 601 }] }, NOW_S, NOW_S - 700)).toBe(false);
  });
  test("a sign-in from before the request doesn't count, even a minute old (stolen tab right after login)", () => {
    expect(freshSignIn({ amr: [{ method: "otp", timestamp: SINCE - 1 }] }, NOW_S, SINCE)).toBe(false);
    expect(freshSignIn({ amr: [{ method: "otp", timestamp: SINCE }] }, NOW_S, SINCE)).toBe(true);
    expect(freshSignIn({ amr: [{ method: "otp", timestamp: NOW_S - 30 }] }, NOW_S, SINCE)).toBe(true);
  });
  test("nothing to compare against = never fresh", () => {
    expect(freshSignIn({ amr: [{ method: "otp", timestamp: NOW_S }] }, NOW_S, null)).toBe(false);
    expect(freshSignIn({ amr: [{ method: "otp", timestamp: NOW_S }] }, NOW_S, Number.NaN)).toBe(false);
  });
  test("an authenticator code is not a sign-in", () => {
    expect(signInAgeSec({ amr: [{ method: "totp", timestamp: NOW_S }] }, NOW_S)).toBeNull();
    expect(freshSignIn({ amr: [{ method: "otp", timestamp: NOW_S - 5000 }, { method: "totp", timestamp: NOW_S }] }, NOW_S, SINCE)).toBe(false);
  });
  test("a connected app's token never counts, and no claims = not fresh", () => {
    expect(freshSignIn({ amr: [{ method: "otp", timestamp: NOW_S }], client_id: "ai-app" }, NOW_S, SINCE)).toBe(false);
    expect(freshSignIn(null, NOW_S, SINCE)).toBe(false);
    expect(freshSignIn({}, NOW_S, SINCE)).toBe(false);
  });
  test("authenticator codes follow the same 'after the request' rule", () => {
    const c = (ts: number) => ({ aal: "aal2", amr: [{ method: "totp", timestamp: ts }] });
    expect(freshTotpAfter(c(NOW_S - 10), NOW_S, SINCE)).toBe(true);
    expect(freshTotpAfter(c(SINCE - 1), NOW_S, SINCE)).toBe(false);
    expect(freshTotpAfter({ aal: "aal1", amr: [{ method: "totp", timestamp: NOW_S }] }, NOW_S, SINCE)).toBe(false);
    expect(freshTotpAfter(c(NOW_S), NOW_S, null)).toBe(false);
  });
});

describe("new members aren't slowed down (S1 exception)", () => {
  test("first 2FA app / first chat, added within 10 minutes of signing in, is trusted", () => {
    expect(recentSignIn({ amr: [{ method: "otp", timestamp: NOW_S - 600 }] }, NOW_S)).toBe(true);
    expect(newFactorTrust({ firstOfKind: true, recentSignIn: true })).toBe("fresh_sign_in");
  });
  test("a second 2FA app or a later chat is 'Not confirmed yet', however recent the sign-in", () => {
    expect(newFactorTrust({ firstOfKind: false, recentSignIn: true })).toBeNull();
  });
  test("first of its kind but signed in over 10 minutes ago: 'Not confirmed yet'", () => {
    expect(recentSignIn({ amr: [{ method: "otp", timestamp: NOW_S - 601 }] }, NOW_S)).toBe(false);
    expect(newFactorTrust({ firstOfKind: true, recentSignIn: false })).toBeNull();
  });
  test("a replacement chat added right after a passed check is trusted", () => {
    expect(newFactorTrust({ firstOfKind: false, recentSignIn: false, steppedUp: true })).toBe("step_up");
  });
});

describe("unlink / replace Telegram 'screen opened at' stamp", () => {
  const KEY = "test-key";
  test("genuine stamp reads back its time for the same member and purpose", async () => {
    const t = await makeIntent(KEY, USER, "telegram_unlink", NOW);
    expect(await readIntent(KEY, t, USER, "telegram_unlink", NOW + 60_000)).toBe(NOW);
  });
  test("refused for another member, purpose, key, a changed time, or after 30 minutes", async () => {
    const t = await makeIntent(KEY, USER, "telegram_unlink", NOW);
    expect(INTENT_MAX_MS).toBe(30 * 60_000);
    expect(await readIntent(KEY, t, ID, "telegram_unlink", NOW)).toBeNull();
    expect(await readIntent(KEY, t, USER, "key_link", NOW)).toBeNull();
    expect(await readIntent("other", t, USER, "telegram_unlink", NOW)).toBeNull();
    expect(await readIntent(KEY, t.replace(String(NOW), String(NOW - 600_000)), USER, "telegram_unlink", NOW)).toBeNull();
    expect(await readIntent(KEY, t, USER, "telegram_unlink", NOW + INTENT_MAX_MS + 1)).toBeNull();
    expect(await readIntent(KEY, null, USER, "telegram_unlink", NOW)).toBeNull();
  });
});

describe("Telegram / 2FA count only when trusted and a day old", () => {
  test("24 hours is the line", () => {
    expect(AGED_MS).toBe(DAY);
    expect(factorCounts({ trustedMs: NOW - DAY, addedMs: NOW - DAY }, NOW)).toBe(true);
    expect(factorCounts({ trustedMs: NOW, addedMs: NOW - DAY + 1 }, NOW)).toBe(false);
  });
  test("untrusted never counts, however old", () => {
    expect(factorCounts({ trustedMs: null, addedMs: NOW - 30 * DAY }, NOW)).toBe(false);
    expect(factorCounts(null, NOW)).toBe(false);
  });
  test("one unconfirmed 2FA app spoils authenticator codes for this check", () => {
    const old = { trustedMs: NOW - 5 * DAY, addedMs: NOW - 5 * DAY };
    expect(totpCounts([old], NOW)).toBe(true);
    expect(totpCounts([old, { trustedMs: null, addedMs: NOW - 2 * DAY }], NOW)).toBe(false);
    expect(totpCounts([old, null], NOW)).toBe(false);
    expect(totpCounts([], NOW)).toBe(false);
  });
  test("a trusted chat may approve sends straight away (age only matters for 'prove it's you')", () => {
    expect(trusted({ trustedMs: NOW, addedMs: NOW })).toBe(true);
    expect(trusted({ trustedMs: null, addedMs: NOW - 9 * DAY })).toBe(false);
  });
});

describe("which options a member sees", () => {
  const aged = { trustedMs: NOW - 2 * DAY, addedMs: NOW - 2 * DAY };
  test("Honest.Money member with day-old Telegram + 2FA gets all four", () => {
    expect(stepUpOptions({ hmeMember: true, fresh: false, factors: [aged], telegram: { connected: true, row: aged }, nowMs: NOW }))
      .toEqual({ fresh: false, signIn: "hme", telegram: true, totp: true, email: true });
  });
  test("coin / wallet member never gets the email option; brand-new chat doesn't count", () => {
    expect(stepUpOptions({ hmeMember: false, fresh: false, factors: [], telegram: { connected: true, row: { trustedMs: NOW, addedMs: NOW } }, nowMs: NOW }))
      .toEqual({ fresh: false, signIn: "key", telegram: false, totp: false, email: false });
  });
});

describe("passing the check", () => {
  test("fresh sign-in, a fresh code from counted 2FA, or an approved proof", () => {
    expect(stepUpPasses({ freshSignIn: true, freshTotp: false, totpCounts: false, proof: false })).toBe(true);
    expect(stepUpPasses({ freshSignIn: false, freshTotp: true, totpCounts: true, proof: false })).toBe(true);
    expect(stepUpPasses({ freshSignIn: false, freshTotp: false, totpCounts: false, proof: true })).toBe(true);
  });
  test("a stolen tab with a just-added 2FA app doesn't pass", () => {
    expect(stepUpPasses({ freshSignIn: false, freshTotp: true, totpCounts: false, proof: false })).toBe(false);
    expect(stepUpPasses({ freshSignIn: false, freshTotp: false, totpCounts: true, proof: false })).toBe(false);
  });
  test("a proof works once, for its own purpose, for 10 minutes", () => {
    expect(STEP_UP_TTL_MS).toBe(600_000);
    expect(STEP_UP_TRIES).toBe(5);
    expect(STEP_UP_PER_HOUR).toBe(6);
    expect(proofUsable({ status: "approved", purpose: "key_link", expiresMs: NOW + 1 }, "key_link", NOW)).toBe(true);
    expect(proofUsable({ status: "used", purpose: "key_link", expiresMs: NOW + 1 }, "key_link", NOW)).toBe(false);
    expect(proofUsable({ status: "approved", purpose: "telegram_unlink", expiresMs: NOW + 1 }, "key_link", NOW)).toBe(false);
    expect(proofUsable({ status: "approved", purpose: "key_link", expiresMs: NOW }, "key_link", NOW)).toBe(false);
    expect(proofUsable({ status: "pending", purpose: "key_link", expiresMs: NOW + 1 }, "key_link", NOW)).toBe(false);
  });
});

describe("Telegram 'Yes, it's me' buttons", () => {
  test("signed per check + member; a forged or swapped button fails", async () => {
    const data = await stepUpButtonData("k", "yes", ID, USER);
    expect(data.length).toBeLessThanOrEqual(64);
    const p = parseStepUpData(data)!;
    expect(await stepUpSignatureOk("k", p, USER)).toBe(true);
    expect(await stepUpSignatureOk("k", p, ID)).toBe(false);
    expect(await stepUpSignatureOk("other", p, USER)).toBe(false);
    expect(await stepUpSignatureOk("k", { ...p, choice: "no" }, USER)).toBe(false);
  });
  const base = { choice: "yes" as const, signatureOk: true, privateChat: true, tapChatId: "42", sentToChatId: "42", ownerChatId: "42", ownerChatCounts: true, status: "pending", expiresAtMs: NOW + 1, nowMs: NOW };
  test("only the day-old chat it was sent to can answer", () => {
    expect(stepUpTapDecision(base)).toBe("approve");
    expect(stepUpTapDecision({ ...base, choice: "no" })).toBe("decline");
    expect(stepUpTapDecision({ ...base, ownerChatCounts: false })).toBe("refuse");
    expect(stepUpTapDecision({ ...base, tapChatId: "43" })).toBe("refuse");
    expect(stepUpTapDecision({ ...base, ownerChatId: "43", tapChatId: "43" })).toBe("refuse");
    expect(stepUpTapDecision({ ...base, privateChat: false })).toBe("refuse");
    expect(stepUpTapDecision({ ...base, status: "approved" })).toBe("already_decided");
    expect(stepUpTapDecision({ ...base, expiresAtMs: NOW })).toBe("expired");
  });
});
