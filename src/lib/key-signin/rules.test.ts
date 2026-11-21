import { describe, expect, test } from "bun:test";
import {
  cleanEmail, isPlaceholderEmail, keySigninMessage, normalizeIdentity, placeholderEmail, pocketFor,
  walletPocketMessage, withdrawEmailProblem,
} from "./rules";

describe("pocket number for a key sign-in", () => {
  test("a brand-new coin starts on pocket 1106", () => {
    expect(pocketFor([])).toBe(1106);
  });
  test("an active link keeps its pocket", () => {
    expect(pocketFor([{ account: 1106, active: false }, { account: 1107, active: true }])).toBe(1107);
  });
  test("after a revoke the next pocket is used, never the old one", () => {
    expect(pocketFor([{ account: 1106, active: false }])).toBe(1107);
  });
  test("no pockets left after 2105", () => {
    expect(pocketFor([{ account: 2105, active: false }])).toBeNull();
  });
});

describe("identities", () => {
  test("EVM addresses are stored lowercased", () => {
    expect(normalizeIdentity("evm", "0xAbCdEf0123456789aBcDeF0123456789abCDef01")).toBe("0xabcdef0123456789abcdef0123456789abcdef01");
  });
  test("a coin identity must be a TEXITcoin address", () => {
    expect(normalizeIdentity("coin", "0xabcdef0123456789abcdef0123456789abcdef01")).toBeNull();
  });
});

describe("messages", () => {
  test("the sign-in message names the site, pocket and payload", () => {
    const m = keySigninMessage({ domain: "seeds.honest.money", challenge: "abc", kind: "coin", identity: "Tx", account: 1106, paths: ["m/44'/696969'/1106'"], payloadSha: "ff" });
    expect(m).toContain("Domain: seeds.honest.money");
    expect(m).toContain("Pocket: 1106");
    expect(m).toContain("Payload-SHA256: ff");
  });
  test("the wallet pocket message is fixed per Seeds Key site", () => {
    expect(walletPocketMessage("a.example")).toBe(walletPocketMessage("a.example"));
    expect(walletPocketMessage("a.example")).not.toBe(walletPocketMessage("b.example"));
  });
});

describe("email", () => {
  test("coin and wallet accounts start with an address Seeds never emails", () => {
    expect(isPlaceholderEmail(placeholderEmail("coin", "ab".repeat(16)))).toBe(true);
    expect(isPlaceholderEmail("bobby@example.com")).toBe(false);
  });
  test("withdrawals need a real email first", () => {
    expect(withdrawEmailProblem(placeholderEmail("evm", "cd".repeat(16)))).not.toBeNull();
    expect(withdrawEmailProblem("bobby@example.com")).toBeNull();
  });
  test("a placeholder address can't be added as a real email", () => {
    expect(cleanEmail("coin-x@key.seeds.local")).toBeNull();
    expect(cleanEmail(" Bobby@Example.com ")).toBe("bobby@example.com");
  });
});

import { keepExistingLink, startingName } from "./rules";

describe("signing in again with the same key", () => {
  const active = { account: 1106, xpubs: { TXC: "a", BTC: "b" }, createdMs: 2_000 };
  test("the same pocket keys keep the existing link", () => {
    expect(keepExistingLink({ active, incoming: { account: 1106, xpubs: { BTC: "b", TXC: "a" } }, twoFactorSinceMs: 1_000, telegramSinceMs: null })).toBe(true);
  });
  test("a link made before 2FA was turned on is replaced, so withdrawals can unlock", () => {
    expect(keepExistingLink({ active, incoming: { account: 1106, xpubs: { TXC: "a", BTC: "b" } }, twoFactorSinceMs: 3_000, telegramSinceMs: null })).toBe(false);
  });
  test("a link made before Telegram was connected is replaced", () => {
    expect(keepExistingLink({ active, incoming: { account: 1106, xpubs: { TXC: "a", BTC: "b" } }, twoFactorSinceMs: null, telegramSinceMs: 2_000 })).toBe(false);
  });
  test("new coins replace the link", () => {
    expect(keepExistingLink({ active, incoming: { account: 1106, xpubs: { TXC: "a", BTC: "b", SOL: "s" } }, twoFactorSinceMs: null, telegramSinceMs: null })).toBe(false);
  });
  test("starting names never show the hidden email", () => {
    expect(startingName("coin", "TZZCuca5ntPVCJL5ryTjh465Jvw5vHxsVd")).toBe("Coin TZZC…xsVd");
  });
});
