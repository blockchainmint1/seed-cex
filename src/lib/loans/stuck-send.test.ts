import { describe, expect, test } from "bun:test";
import { LENDING_OPEN, lendingClosedProblem, SEND_STUCK_MS, stuckSendStep } from "./rules";

const now = Date.parse("2026-11-22T22:00:00Z");

describe("Seeds Lend is switched off (Bobby, Nov 22 2026)", () => {
  test("the master switch is off and every action gets a plain refusal", () => {
    expect(LENDING_OPEN).toBe(false);
    expect(lendingClosedProblem()).toContain("switched off");
    expect(lendingClosedProblem(true)).toBeNull();
  });
});

describe("audit L1/L5: a send that errored after broadcast is never treated as unsent", () => {
  const base = { startedAtMs: now - 5_000, loanTxid: null, approvalTxid: null, approvalError: false, nowMs: now };

  test("repayment threw after the txid was recorded → adopt it (no reopen, so no liquidation)", () => {
    expect(stuckSendStep({ ...base, approvalTxid: "ab".repeat(32), approvalError: true })).toBe("adopt");
  });
  test("failed before anything was recorded → reopen so it can be tried again", () => {
    expect(stuckSendStep({ ...base, approvalError: true })).toBe("reopen");
  });
  test("no txid and no error yet → wait while the send may still be running", () => {
    expect(stuckSendStep(base)).toBe("wait");
  });
  test("no txid after 10 minutes → the send died before broadcasting, reopen (funding never stays stuck)", () => {
    expect(SEND_STUCK_MS).toBe(10 * 60_000);
    expect(stuckSendStep({ ...base, startedAtMs: now - SEND_STUCK_MS })).toBe("reopen");
  });
  test("already on the loan, or never started → nothing to do", () => {
    expect(stuckSendStep({ ...base, loanTxid: "cd".repeat(32), approvalTxid: "ab".repeat(32) })).toBe("none");
    expect(stuckSendStep({ ...base, startedAtMs: null })).toBe("none");
  });
});
