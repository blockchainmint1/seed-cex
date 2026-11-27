import { describe, expect, test } from "bun:test";
import { canRequestDayRetry, currentAiMessage, interruptedStartDecision, planSwapAmount, runAiStart } from "./start-recovery";

describe("QA-0018 interrupted basket starts", () => {
  test("reopening a day invalidates its old Telegram message", () => {
    expect(currentAiMessage(12, 12)).toBe(true);
    expect(currentAiMessage(null, 12)).toBe(false);
    expect(currentAiMessage(13, 12)).toBe(false);
  });
  test("inputs never round above the approved 10 TSD buy or coin quantity", () => {
    expect(planSwapAmount("buy", 10)).toBe("10.00");
    expect(planSwapAmount("buy", 10.009)).toBe("10.00");
    expect(planSwapAmount("sell", 0.123456789)).toBe("0.12345678");
  });
  test("a three-minute unrecorded start stops only after a successful absence check", () => {
    expect(interruptedStartDecision({ lookupOk: true, matchingRoutes: 0, ageMs: 180_000 })).toBe("wait");
    expect(interruptedStartDecision({ lookupOk: true, matchingRoutes: 0, ageMs: 180_001 })).toBe("stop");
    expect(interruptedStartDecision({ lookupOk: false, matchingRoutes: 0, ageMs: 900_000 })).toBe("wait");
  });
  test("a possibly untracked swap requires review, never a second start", () => {
    expect(interruptedStartDecision({ lookupOk: true, matchingRoutes: 1, ageMs: 900_000 })).toBe("review");
  });
  test("the reported five stopped buys offer a retry; any linked or completed buy refuses it", () => {
    const moves = Array.from({ length: 5 }, (_, i) => ({ status: i === 0 ? "failed" : "cancelled", routeId: null as string | null }));
    expect(canRequestDayRetry("cancelled", moves)).toBe(true);
    expect(canRequestDayRetry("approved", moves)).toBe(false);
    expect(canRequestDayRetry("cancelled", [{ status: "failed", routeId: "already-created" }, ...moves.slice(1)])).toBe(false);
    expect(canRequestDayRetry("cancelled", [{ status: "done", routeId: null }, ...moves.slice(1)])).toBe(false);
    expect(canRequestDayRetry("cancelled", [])).toBe(false);
  });
  test("lost reservation response preserves the linked swap instead of failing the basket", async () => {
    let failures = 0;
    expect(await runAiStart({ start: async () => { throw new Error("response lost"); },
      readLink: async () => ({ ok: true, routeId: "reserved-swap" }), fail: async () => { failures++; } })).toBe(true);
    expect(failures).toBe(0);
  });
  test("an unreadable reservation outcome waits without failing or retrying", async () => {
    let failures = 0;
    await runAiStart({ start: async () => { throw new Error("timeout"); },
      readLink: async () => ({ ok: false, routeId: null }), fail: async () => { failures++; } });
    expect(failures).toBe(0);
  });
  test("a definite pre-reservation refusal retains its actual reason", async () => {
    let reason = "";
    expect(await runAiStart({ start: async () => { throw new Error("Not enough ETH for network fees."); },
      readLink: async () => ({ ok: true, routeId: null }), fail: async (r) => { reason = r; } })).toBe(false);
    expect(reason).toBe("Not enough ETH for network fees.");
  });
});