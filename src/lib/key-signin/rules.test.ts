import { describe, expect, test } from "bun:test";
import {
  cleanEmail, isPlaceholderEmail, keySigninMessage, normalizeIdentity, placeholderEmail, pocketFor,
  walletPocketMessage, withdrawEmailProblem, checksumEvmAddress, pairingCode, accountEmailProblem,
  ACCOUNT_EMAIL_CODE_NEEDED, shouldAlarmNewAccounts,
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
  test("pages admins at 500 new coin/wallet accounts in an hour, then every further 500", () => {
    expect(shouldAlarmNewAccounts(499)).toBe(false);
    expect(shouldAlarmNewAccounts(500)).toBe(true);
    expect(shouldAlarmNewAccounts(501)).toBe(false);
    expect(shouldAlarmNewAccounts(1000)).toBe(true);
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
