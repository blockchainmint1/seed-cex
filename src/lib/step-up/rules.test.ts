import { describe, expect, test } from "bun:test";
import {
  AGED_MS, FRESH_SIGNIN_SEC, STEP_UP_PER_HOUR, STEP_UP_TRIES, STEP_UP_TTL_MS,
  factorCounts, freshSignIn, newFactorTrust, parseStepUpData, proofUsable, signInAgeSec, stepUpButtonData,
  stepUpOptions, stepUpPasses, stepUpSignatureOk, stepUpTapDecision, totpCounts, trusted,
} from "./rules";

const NOW_S = 1_800_000_000;
const NOW = NOW_S * 1000;
const DAY = 24 * 3600_000;
const ID = "11111111-2222-4333-8444-555555555555";
const USER = "99999999-8888-4777-8666-555555555555";

describe("fresh sign-in (option 1, offered first)", () => {
  test("signed in 15 minutes ago or less counts; older doesn't", () => {
    expect(FRESH_SIGNIN_SEC).toBe(900);
    expect(freshSignIn({ amr: [{ method: "otp", timestamp: NOW_S - 900 }] }, NOW_S)).toBe(true);
    expect(freshSignIn({ amr: [{ method: "otp", timestamp: NOW_S - 901 }] }, NOW_S)).toBe(false);
  });
  test("an authenticator code is not a sign-in", () => {
    expect(signInAgeSec({ amr: [{ method: "totp", timestamp: NOW_S }] }, NOW_S)).toBeNull();
    expect(freshSignIn({ amr: [{ method: "otp", timestamp: NOW_S - 5000 }, { method: "totp", timestamp: NOW_S }] }, NOW_S)).toBe(false);
  });
  test("a connected app's token never counts, and no claims = not fresh", () => {
    expect(freshSignIn({ amr: [{ method: "otp", timestamp: NOW_S }], client_id: "ai-app" }, NOW_S)).toBe(false);
    expect(freshSignIn(null, NOW_S)).toBe(false);
    expect(freshSignIn({}, NOW_S)).toBe(false);
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

describe("new 2FA app / Telegram chat", () => {
  test("trusted right away only after a fresh sign-in, otherwise 'Not confirmed yet'", () => {
    expect(newFactorTrust(true)).toBe("fresh_sign_in");
    expect(newFactorTrust(false)).toBeNull();
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
