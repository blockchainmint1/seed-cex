import { describe, expect, test } from "bun:test";
import {
  cleanEmail, isPlaceholderEmail, keySigninMessage, keyHostOf, keysDiffer, replaceConfirmProblem, REPLACE_CODE_NEEDED, REPLACE_CODE_TRIES, REPLACE_CONFIRM_MS, normalizeIdentity, placeholderEmail, pocketFor,
  walletPocketMessage, withdrawEmailProblem, checksumEvmAddress, pairingCode, accountEmailProblem,
  ACCOUNT_EMAIL_CODE_NEEDED, shouldAlarmNewAccounts,
} from "./rules";

describe("pocket number for a key sign-in", () => {
  test("a brand-new coin starts on pocket 1106", () => {
    expect(pocketFor([])).toBe(1106);
  });
  test("an active link stays on 1106", () => {
    expect(pocketFor([{ account: 1106, active: true }])).toBe(1106);
  });
  test("after a revoke, signing in again brings back pocket 1106, not 1107", () => {
    expect(pocketFor([{ account: 1106, active: false }])).toBe(1106);
    expect(pocketFor([{ account: 1106, active: false }, { account: 1106, active: false }])).toBe(1106);
  });
  test("an older account that once rotated to 1107 comes back to 1106", () => {
    expect(pocketFor([{ account: 1107, active: false }])).toBe(1106);
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
  const W = { domain: "seeds.honest.money", challenge: "c".repeat(48), account: 1106, paths: ["m/44'/696969'/1106'", "m/44'/60'/1106'"], payloadSha: "ff",
    keyHost: "key.seeds.honest.money", issuedAt: "2026-11-21T17:00:00.000Z", expiresAt: "2026-11-21T17:10:00.000Z" };
  test("wallet sign-ins use the Sign-In with Ethereum layout bound to the Seeds Key host", () => {
    const m = keySigninMessage({ ...W, kind: "evm", identity: "0x2c7536e3605d9c16a7a3d7b1898e529396a65c23" });
    expect(m.split("\n")[0]).toBe("key.seeds.honest.money wants you to sign in with your Ethereum account:");
    expect(m.split("\n")[1]).toBe(checksumEvmAddress("0x2c7536e3605d9c16a7a3d7b1898e529396a65c23"));
    expect(m).toContain("\nURI: https://key.seeds.honest.money\n");
    expect(m).toContain(`\nNonce: ${"c".repeat(48)}\n`);
    expect(m).toContain("\nExpiration Time: 2026-11-21T17:10:00.000Z\n");
    expect(m).toContain("\n- urn:seeds:path:m/44'/60'/1106'");
    expect(m.endsWith("- urn:seeds:payload-sha256:ff")).toBe(true);
  });
  test("Solana sign-ins use the same layout with the Solana chain", () => {
    const m = keySigninMessage({ ...W, kind: "sol", identity: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" });
    expect(m.split("\n")[0]).toBe("key.seeds.honest.money wants you to sign in with your Solana account:");
    expect(m).toContain("\nChain ID: mainnet\n");
  });
  test("a wallet sign-in can't be built without the Seeds Key host", () => {
    expect(() => keySigninMessage({ ...W, keyHost: undefined, kind: "evm", identity: "0x2c7536e3605d9c16a7a3d7b1898e529396a65c23" })).toThrow();
  });
  test("the Seeds Key host comes only from an https address", () => {
    expect(keyHostOf("https://key.seeds.honest.money")).toBe("key.seeds.honest.money");
    expect(keyHostOf("http://key.seeds.honest.money")).toBeNull();
    expect(keyHostOf("")).toBeNull();
  });
  test("the sign-in message names the site, pocket and payload", () => {
    const m = keySigninMessage({ domain: "seeds.honest.money", challenge: "abc", kind: "coin", identity: "Tx", account: 1106, paths: ["m/44'/696969'/1106'"], payloadSha: "ff" });
    expect(m).toContain("Domain: seeds.honest.money");
    expect(m).toContain("Pocket: 1106");
    expect(m).toContain("Payload-SHA256: ff");
  });
  const A = "0x2c7536e3605d9c16a7a3d7b1898e529396a65c23";
  test("the wallet pocket message is fixed per Seeds Key site and wallet", () => {
    expect(walletPocketMessage("a.example", "evm", A)).toBe(walletPocketMessage("a.example", "evm", A));
    expect(walletPocketMessage("a.example", "evm", A)).not.toBe(walletPocketMessage("b.example", "evm", A));
  });
  test("the wallet pocket message uses the Sign-In with Ethereum layout, so wallets warn on look-alike sites", () => {
    const lines = walletPocketMessage("key.seeds.honest.money", "evm", A).split("\n");
    expect(lines[0]).toBe("key.seeds.honest.money wants you to sign in with your Ethereum account:");
    expect(lines[1]).toBe("0x2c7536E3605D9C16a7a3D7b1898e529396a65c23");
    expect(lines).toContain("URI: https://key.seeds.honest.money");
    expect(lines).toContain("Version: 1");
    expect(lines).toContain("Chain ID: 1");
    expect(lines).toContain("Nonce: SeedsPocket2");
    expect(lines).toContain("Issued At: 2026-11-21T00:00:00.000Z");
  });
  test("Solana wallets get the Sign-In with Solana layout", () => {
    const sol = "DXTivYcF78Vznitg6f8JGXouZwsm3xioik1LGWj2H1jV";
    const lines = walletPocketMessage("key.seeds.honest.money", "sol", sol).split("\n");
    expect(lines[0]).toBe("key.seeds.honest.money wants you to sign in with your Solana account:");
    expect(lines[1]).toBe(sol);
    expect(lines).toContain("Chain ID: mainnet");
  });
  test("EVM addresses are shown in checksummed form (EIP-55 vector)", () => {
    expect(checksumEvmAddress("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed")).toBe("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
    expect(checksumEvmAddress("nope")).toBeNull();
  });
});

describe("pairing code (QR sign-in hijack)", () => {
  test("is three digits and the same on both screens for one request", () => {
    expect(pairingCode("c".repeat(48))).toBe("673");
    expect(pairingCode("c".repeat(48))).toMatch(/^\d{3}$/);
  });
  test("differs between requests", () => {
    const codes = new Set(Array.from({ length: 50 }, (_, i) => pairingCode(`challenge-${i}`)));
    expect(codes.size).toBeGreaterThan(40);
  });
});

describe("adding an email to a coin / wallet account", () => {
  test("needs a fresh authenticator code when two-factor is on", () => {
    expect(accountEmailProblem({ twoFactorOn: true, fresh: false })).toBe(ACCOUNT_EMAIL_CODE_NEEDED);
    expect(accountEmailProblem({ twoFactorOn: true, fresh: true })).toBeNull();
  });
  test("works without a code when two-factor is off (withdrawals still need two-factor)", () => {
    expect(accountEmailProblem({ twoFactorOn: false, fresh: false })).toBeNull();
  });
});

describe("new-account burst alarm", () => {
  const NOW = 1_800_000_000_000;
  test("pages admins at 500 or more new coin/wallet accounts in an hour", () => {
    expect(shouldAlarmNewAccounts(499, null, NOW)).toBe(false);
    expect(shouldAlarmNewAccounts(500, null, NOW)).toBe(true);
    // Two sign-ups finishing together can jump 499 -> 501: still alarms.
    expect(shouldAlarmNewAccounts(501, null, NOW)).toBe(true);
  });
  test("at most once every 10 minutes", () => {
    expect(shouldAlarmNewAccounts(800, NOW - 9 * 60_000, NOW)).toBe(false);
    expect(shouldAlarmNewAccounts(800, NOW - 10 * 60_000, NOW)).toBe(true);
  });
});

describe("sign-in bringing different pocket keys (auditor follow-up)", () => {
  const active = { account: 1106, xpubs: { TXC: "xpubA", BTC: "xpubB" } };
  test("same keys (a normal re-sign-in) are not a key change", () => {
    expect(keysDiffer(active, { account: 1106, xpubs: { TXC: "xpubA", BTC: "xpubB" } })).toBe(false);
  });
  test("adding coins with the existing keys unchanged is not a key change", () => {
    expect(keysDiffer(active, { account: 1106, xpubs: { TXC: "xpubA", BTC: "xpubB", DOGE: "xpubD" } })).toBe(false);
  });
  test("any shared coin with a different key is a key change", () => {
    expect(keysDiffer(active, { account: 1106, xpubs: { TXC: "xpubEVIL", BTC: "xpubB" } })).toBe(true);
    expect(keysDiffer(active, { account: 1107, xpubs: active.xpubs })).toBe(true);
  });
  const T = 1_800_000_000_000;
  test("with two-factor on, the change needs a 6-digit authenticator code", () => {
    expect(replaceConfirmProblem({ claimedMs: T, nowMs: T + 1000, tries: 0, twoFactorOn: true, code: null })).toBe(REPLACE_CODE_NEEDED);
    expect(replaceConfirmProblem({ claimedMs: T, nowMs: T + 1000, tries: 0, twoFactorOn: true, code: "123456" })).toBeNull();
  });
  test("with two-factor off, the screen's yes is enough (the member was already told)", () => {
    expect(replaceConfirmProblem({ claimedMs: T, nowMs: T + 1000, tries: 0, twoFactorOn: false, code: null })).toBeNull();
  });
  test("runs out 10 minutes after the screen collects it, and after 5 wrong codes", () => {
    expect(replaceConfirmProblem({ claimedMs: T, nowMs: T + REPLACE_CONFIRM_MS + 1, tries: 0, twoFactorOn: false, code: null })).toContain("ran out");
    expect(replaceConfirmProblem({ claimedMs: T, nowMs: T + 1000, tries: REPLACE_CODE_TRIES, twoFactorOn: true, code: "123456" })).toContain("Too many");
    expect(REPLACE_CODE_TRIES).toBe(5);
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
    expect(startingName("coin", "TZZCuca5ntPVCJL5ryTjh465Jvw5vHxsVd")).toBe("Coin ZZCuca");
    expect(startingName("evm", "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01")).toBe("Wallet 0xAb…Ef01");
  });
});
