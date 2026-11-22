import { describe, expect, test } from "bun:test";
import { isKeyKind, keySigninTab, keyWithdrawSteps, nextKeyWithdrawStep, relinkButton, relinkStep } from "./sign-in-kind";

describe("coin and wallet members re-link by signing in again", () => {
  test("only coin / Ethereum / Solana sign-ins are key accounts", () => {
    expect(isKeyKind("coin")).toBe(true);
    expect(isKeyKind("evm")).toBe(true);
    expect(isKeyKind("sol")).toBe(true);
    expect(isKeyKind("hme")).toBe(false);
    expect(isKeyKind(null)).toBe(false);
  });
  test("HME members still re-link their HME Wallet", () => {
    expect(relinkStep("hme")).toContain("re-link your HME Wallet");
    expect(relinkButton("hme")).toBe("Re-link HME Wallet");
  });
  test("coin members sign in again with their coin, never 'HME Wallet'", () => {
    expect(relinkStep("coin")).toContain("sign in again with your coin");
    expect(relinkStep("coin")).not.toContain("HME Wallet");
    expect(relinkButton("coin")).toBe("Sign in again with your coin");
    expect(keySigninTab("coin")).toBe("coin");
  });
  test("outside-wallet members use the wallet tab", () => {
    expect(relinkStep("evm")).toContain("sign in again with your Ethereum wallet");
    expect(relinkStep("sol")).toContain("sign in again with your Solana wallet");
    expect(keySigninTab("evm")).toBe("wallet");
    expect(keySigninTab("sol")).toBe("wallet");
  });
});

describe("steps to a coin member's first withdrawal", () => {
  const none = { kind: "coin" as const, hasEmail: false, twoFactorOn: false, telegramOn: false, serverReady: false };
  test("order: email, two-factor, Telegram, then sign in again", () => {
    expect(keyWithdrawSteps(none).map((s) => s.key)).toEqual(["email", "two_factor", "telegram", "sign_in_again"]);
    expect(nextKeyWithdrawStep(keyWithdrawSteps(none))?.key).toBe("email");
  });
  test("sign-in-again is not done while two-factor or Telegram is missing, even if the server says ready", () => {
    const s = keyWithdrawSteps({ ...none, hasEmail: true, twoFactorOn: true, telegramOn: false, serverReady: true });
    expect(s.find((x) => x.key === "sign_in_again")?.done).toBe(false);
  });
  test("everything set up but pocket link older than the setup: sign in again is next", () => {
    const s = keyWithdrawSteps({ ...none, hasEmail: true, twoFactorOn: true, telegramOn: true, serverReady: false });
    expect(nextKeyWithdrawStep(s)?.key).toBe("sign_in_again");
  });
  test("all four done once the server says ready", () => {
    const s = keyWithdrawSteps({ ...none, hasEmail: true, twoFactorOn: true, telegramOn: true, serverReady: true });
    expect(nextKeyWithdrawStep(s)).toBeNull();
  });
});

import { pocketSource } from "./sign-in-kind";

describe("where the trading pocket comes from", () => {
  test("coin / wallet accounts: always their own sign-in key", () => {
    expect(pocketSource("coin", null)).toEqual({ kind: "coin", viaLink: false });
    expect(pocketSource("evm", { source: "seeds_key", keyKind: "evm" })).toEqual({ kind: "evm", viaLink: false });
  });
  test("Honest.Money member with a linked coin: the coin, re-linked by linking again", () => {
    expect(pocketSource("hme", { source: "seeds_key", keyKind: "coin" })).toEqual({ kind: "coin", viaLink: true });
    expect(relinkButton("coin", true)).toBe("Link your coin again");
    expect(relinkStep("sol", true)).toContain("link your Solana wallet again");
  });
  test("Honest.Money member with HME Wallet or nothing linked: HME Wallet", () => {
    expect(pocketSource("hme", { source: "hme_wallet", keyKind: null })).toEqual({ kind: "hme", viaLink: false });
    expect(pocketSource("hme", null)).toEqual({ kind: "hme", viaLink: false });
  });
});
