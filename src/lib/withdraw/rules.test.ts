import { describe, expect, test } from "bun:test";
import {
  amountProblem, codeDigest, detailsDigest, detailsText, emailCodeProblem, maskEmail, newEmailCode, parseDestinationTag,
  parseUnits, readinessProblem, sendBlocker, unitsToText, withdrawReadiness, EMAIL_CODE_TTL_MS, EMAIL_CODE_MAX_TRIES,
} from "./rules";
import { WITHDRAW_COINS, withdrawCoin } from "./catalog";
import { getChain } from "@/lib/chains";
import { DEPOSIT_ASSETS } from "@/lib/account/deposit-options";

const T = (s: string) => Date.parse(s);
const base = { twoFactorSinceMs: T("2026-11-19T10:00:00Z"), telegramVerified: true, telegramSinceMs: T("2026-11-19T11:00:00Z"), linkCreatedMs: T("2026-11-19T12:00:00Z") };

describe("who can withdraw (Bobby: 2FA and Telegram both before the wallet link)", () => {
  test("two-factor, then Telegram, then the link: ready", () => {
    expect(withdrawReadiness(base)).toBe("ready");
  });
  test("no two-factor: needs two-factor", () => {
    expect(withdrawReadiness({ ...base, twoFactorSinceMs: null })).toBe("needs_2fa");
  });
  test("no Telegram: needs Telegram", () => {
    expect(withdrawReadiness({ ...base, telegramVerified: false, telegramSinceMs: null })).toBe("needs_telegram");
  });
  test("link made before two-factor: re-link", () => {
    expect(withdrawReadiness({ ...base, twoFactorSinceMs: T("2026-11-19T13:00:00Z") })).toBe("needs_relink");
  });
  test("link made before Telegram was connected: re-link", () => {
    expect(withdrawReadiness({ ...base, telegramSinceMs: T("2026-11-19T13:00:00Z") })).toBe("needs_relink");
  });
  test("Telegram connected before Seeds recorded the time: order can't be proven, so re-link", () => {
    expect(withdrawReadiness({ ...base, telegramSinceMs: null })).toBe("needs_relink");
  });
  test("every non-ready state explains what to do", () => {
    for (const r of ["needs_2fa", "needs_telegram", "needs_relink"] as const) expect(readinessProblem(r)?.toLowerCase()).toContain("re-link");
    expect(readinessProblem("ready")).toBeNull();
  });
});

describe("pilot and link checks", () => {
  const link = { mode: "access", hasKey: true, address: "D8abc" };
  test("open to every member who follows the rules, not just beta testers (Bobby, Nov 20)", () => {
    expect(sendBlocker({ link, tester: false, frozen: false, symbol: "DOGE", networkLabel: "Dogecoin" })).toBeNull();
    expect(sendBlocker({ link, tester: true, frozen: false, symbol: "DOGE", networkLabel: "Dogecoin" })).toBeNull();
  });
  test("a paused account can't withdraw", () => {
    expect(sendBlocker({ link, tester: true, frozen: true, symbol: "DOGE", networkLabel: "Dogecoin" })).toContain("paused");
  });
  test("approve-every-trade links can't withdraw through Seeds", () => {
    expect(sendBlocker({ link: { ...link, mode: "approve" }, tester: true, frozen: false, symbol: "DOGE", networkLabel: "Dogecoin" })).toContain("instant access");
  });
});

describe("email codes", () => {
  const d = detailsText({ userId: "u1", key: "DOGE:doge", units: 100_000_000n, to: "DAddr", tag: null });
  test("a code is six digits", () => {
    for (let i = 0; i < 50; i++) expect(newEmailCode()).toMatch(/^\d{6}$/);
  });
  test("a code only matches the exact withdrawal it was sent for", async () => {
    const other = detailsText({ userId: "u1", key: "DOGE:doge", units: 100_000_001n, to: "DAddr", tag: null });
    expect(await codeDigest("s", d, "123456")).toBe(await codeDigest("s", d, "123456"));
    expect(await codeDigest("s", other, "123456")).not.toBe(await codeDigest("s", d, "123456"));
    expect(await detailsDigest("s", other)).not.toBe(await detailsDigest("s", d));
  });
  test("an XRP destination tag is part of what the code approves", () => {
    expect(detailsText({ userId: "u1", key: "XRP:xrp", units: 1n, to: "r1", tag: 7 })).not.toBe(detailsText({ userId: "u1", key: "XRP:xrp", units: 1n, to: "r1", tag: 8 }));
  });
  test("without the server secret the digest differs", async () => {
    expect(await codeDigest("other", d, "123456")).not.toBe(await codeDigest("s", d, "123456"));
  });
  test("codes last 10 minutes and allow 5 tries", () => {
    expect(EMAIL_CODE_TTL_MS).toBe(600_000);
    expect(EMAIL_CODE_MAX_TRIES).toBe(5);
  });
  test("only an 'ok' answer lets the withdrawal go ahead", () => {
    expect(emailCodeProblem("ok")).toBeNull();
    for (const r of ["wrong", "locked", "expired", "none", "anything"]) expect(emailCodeProblem(r)).not.toBeNull();
  });
  test("the inbox is masked", () => {
    expect(maskEmail("bobby@gmail.com")).toBe("bo***@gm***.com");
  });
});

describe("amounts", () => {
  test("exact base units, no rounding", () => {
    expect(parseUnits("1.5", 8)).toBe(150_000_000n);
    expect(parseUnits("0.000000001", 8)).toBeNull();
    expect(unitsToText(150_000_000n, 8)).toBe("1.5");
  });
  test("more than the pocket holds is refused", () => {
    expect(amountProblem({ symbol: "DOGE", decimals: 8, units: 200n, balance: 100n, feeBalance: 100n })).toContain("holds");
  });
  test("a native coin can't be sent down to zero (the fee comes from it)", () => {
    expect(amountProblem({ symbol: "DOGE", decimals: 8, units: 100n, balance: 100n, feeBalance: 100n })).toContain("network fee");
  });
  test("a token needs some of its network's fee coin", () => {
    expect(amountProblem({ symbol: "USDC", decimals: 6, units: 1n, balance: 5n, feeBalance: 0n, feeCoin: "ETH" })).toContain("ETH");
    expect(amountProblem({ symbol: "USDC", decimals: 6, units: 5n, balance: 5n, feeBalance: 10n, feeCoin: "ETH" })).toBeNull();
  });
  test("destination tags are whole numbers up to 4294967295", () => {
    expect(parseDestinationTag("")).toEqual({ ok: true, tag: null });
    expect(parseDestinationTag("12345")).toEqual({ ok: true, tag: 12345 });
    expect(parseDestinationTag("4294967296").ok).toBe(false);
    expect(parseDestinationTag("12a").ok).toBe(false);
  });
});

describe("every coin Seeds can send", () => {
  test("covers every deposit network except Zcash (no signer yet)", () => {
    const missing = DEPOSIT_ASSETS.flatMap((a) => a.networks.map((n) => `${a.symbol}:${n.id}`)).filter((k) => !WITHDRAW_COINS.some((c) => c.key === k));
    expect(missing).toEqual(["ZEC:zec"]);
  });
  test("EVM coins use the same decimals as the network's coin list", () => {
    for (const c of WITHDRAW_COINS.filter((x) => x.kind === "evm")) {
      const a = getChain(c.evmChain!).assets.find((x) => x.symbol === c.symbol);
      expect(a?.decimals).toBe(c.decimals);
    }
  });
  test("PulseChain coins are on the same rules as everything else", () => {
    expect(withdrawCoin("PLS", "pulsechain")?.kind).toBe("evm");
    expect(withdrawCoin("pHEX", "pulsechain")?.feeCoin).toBe("PLS");
  });
});
