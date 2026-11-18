import { describe, expect, test } from "bun:test";
import {
  destinationProblem, feeTooHigh, parseUnits, PULSE_HOLD_HOURS, PULSE_WITHDRAW_LIMITS, pulseSendBlocker, withdrawalProblem,
} from "./withdraw-rules";

const PLS = 10n ** 18n;
const access = { mode: "access", hasKey: true, hasEvm: true };

describe("who Seeds can send PulseChain coins for", () => {
  test("an admin with an instant-access pocket during the pilot", () => expect(pulseSendBlocker({ link: access, isAdmin: true })).toBeNull());
  test("not regular members during the pilot", () => expect(pulseSendBlocker({ link: access, isAdmin: false })).toContain("test"));
  test("not approve-every-trade pockets (Seeds holds no key)", () =>
    expect(pulseSendBlocker({ link: { mode: "approve", hasKey: false, hasEvm: true }, isAdmin: true })).toContain("instant access"));
  test("not without a linked pocket", () => expect(pulseSendBlocker({ link: null, isAdmin: true })).toContain("Link"));
});

describe("limits Bobby's pilot uses", () => {
  test("$250 per withdrawal, $1,000 a day, 24-hour hold", () => {
    expect(PULSE_WITHDRAW_LIMITS.perWithdrawalUsd).toBe(250);
    expect(PULSE_WITHDRAW_LIMITS.dailyUsd).toBe(1000);
    expect(PULSE_HOLD_HOURS).toBe(24);
  });
  test("refuses $251", () =>
    expect(withdrawalProblem({ coin: "PLS", units: 1000n * PLS, balanceUnits: 10_000n * PLS, plsBalanceWei: 10_000n * PLS, amountUsd: 251 })).toContain("$250"));
  test("allows $250", () =>
    expect(withdrawalProblem({ coin: "PLS", units: 1000n * PLS, balanceUnits: 10_000n * PLS, plsBalanceWei: 10_000n * PLS, amountUsd: 250 })).toBeNull());
});

describe("amounts and balances", () => {
  test("PLS needs 500 PLS left for the fee", () =>
    expect(withdrawalProblem({ coin: "PLS", units: 600n * PLS, balanceUnits: 1000n * PLS, plsBalanceWei: 1000n * PLS, amountUsd: 1 })).toContain("500 PLS"));
  test("pHEX needs PLS in the pocket for the fee", () =>
    expect(withdrawalProblem({ coin: "pHEX", units: 100n, balanceUnits: 1000n, plsBalanceWei: 0n, amountUsd: 1 })).toContain("PLS"));
  test("no more than the pocket holds", () =>
    expect(withdrawalProblem({ coin: "pHEX", units: 2000n, balanceUnits: 1000n, plsBalanceWei: 1000n * PLS, amountUsd: 1 })).toContain("holds"));
  test("no price, no withdrawal", () =>
    expect(withdrawalProblem({ coin: "pHEX", units: 100n, balanceUnits: 1000n, plsBalanceWei: 1000n * PLS, amountUsd: null })).toContain("price"));
  test("parses exact base units without float drift", () => {
    expect(parseUnits("1.5", 8)).toBe(150_000_000n);
    expect(parseUnits("0.1", 18)).toBe(100_000_000_000_000_000n);
    expect(parseUnits("1.123456789", 8)).toBeNull();
    expect(parseUnits("0", 8)).toBeNull();
    expect(parseUnits("-1", 8)).toBeNull();
    expect(parseUnits("1e5", 8)).toBeNull();
  });
});

describe("destinations", () => {
  const own = "0x1111111111111111111111111111111111111111";
  test("accepts a normal 0x address", () => expect(destinationProblem("0x2222222222222222222222222222222222222222", own)).toBeNull());
  test("refuses the burn address, the HEX contract and the pocket itself", () => {
    expect(destinationProblem("0x0000000000000000000000000000000000000000", own)).toContain("burn");
    expect(destinationProblem("0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39", own)).toContain("HEX contract");
    expect(destinationProblem(own.toUpperCase().replace("0X", "0x"), own)).toContain("own address");
  });
  test("refuses non-EVM text", () => expect(destinationProblem("TiwXXpo37QWNnykS1LTHVfmJArTvSETNX5", own)).toContain("0x"));
});

describe("network fee cap", () => {
  test("refuses a fee over 5,000 PLS", () => {
    expect(feeTooHigh(100_000n, 1_000_000n * 10n ** 9n)).toBe(false); // 100k gas at 1M gwei = 100 PLS
    expect(feeTooHigh(100_000n, 60_000_000n * 10n ** 9n)).toBe(true); // = 6,000 PLS
  });
});
