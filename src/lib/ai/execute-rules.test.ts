import { describe, expect, test } from "bun:test";
import { aiButtonData, aiButtonOk, aiTapDecision, ledgerFrom, moveAmountNow, oneTapAllowed, parseAiButton, planRealMoves, realBuyingBlocker } from "./execute-rules";

describe("plan ledger", () => {
  test("starts as the committed TSD and follows finished swaps", () => {
    const l = ledgerFrom(500, [
      { side: "buy", coin: "bitcoin", amountIn: 240, amountOut: 0.0026 },
      { side: "buy", coin: "bitcoin", amountIn: 240, amountOut: 0.0026 },
      { side: "sell", coin: "bitcoin", amountIn: 0.001, amountOut: 90 },
    ]);
    expect(l.tsd).toBe(110);
    expect(l.units.bitcoin).toBeCloseTo(0.0042, 8);
  });
});

describe("real moves", () => {
  const prices = { bitcoin: 92_000, ethereum: 3_000 };
  test("500 TSD into 100% BTC goes in pieces under the $250 swap limit", () => {
    const m = planRealMoves({ ledger: { tsd: 500, units: {} }, targets: { bitcoin: 1 }, prices, planTradedToday: true, perSwapUsd: 250 });
    expect(m.every((x) => x.side === "buy" && x.coin === "bitcoin")).toBe(true);
    expect(m.length).toBe(3);
    expect(m.every((x) => x.amount <= 240)).toBe(true);
    expect(m.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(500, 1);
  });
  test("going to cash sells the whole coin, sells first", () => {
    const m = planRealMoves({ ledger: { tsd: 100, units: { bitcoin: 0.002, ethereum: 0.05 } }, targets: { ethereum: 0.6 }, prices, planTradedToday: true, perSwapUsd: 250 });
    expect(m[0]!.side).toBe("sell");
    expect(m.filter((x) => x.coin === "bitcoin").reduce((s, x) => s + x.amount, 0)).toBeCloseTo(0.002, 8);
  });
  test("on a quiet day small drift doesn't trade", () => {
    const m = planRealMoves({ ledger: { tsd: 0, units: { bitcoin: 0.0052 } }, targets: { bitcoin: 0.97 }, prices, planTradedToday: false, perSwapUsd: 250 });
    expect(m).toEqual([]);
  });
  test("never plans to spend more TSD than the plan has", () => {
    const m = planRealMoves({ ledger: { tsd: 100, units: {} }, targets: { bitcoin: 0.5, ethereum: 0.5 }, prices, planTradedToday: true, perSwapUsd: 250 });
    expect(m.reduce((s, x) => s + x.amount, 0)).toBeLessThanOrEqual(100);
  });
  test("trades under $10 are skipped", () => {
    expect(planRealMoves({ ledger: { tsd: 8, units: {} }, targets: { bitcoin: 1 }, prices, planTradedToday: true, perSwapUsd: 250 })).toEqual([]);
  });
});

describe("approval", () => {
  test("one-tap only up to the admin limit ($50)", () => {
    expect(oneTapAllowed(50, 50)).toBe(true);
    expect(oneTapAllowed(50.01, 50)).toBe(false);
  });
  test("a big day can't be approved from Telegram", () => {
    const base = { signatureOk: true, privateChat: true, tapChatId: "1", ownerChatId: "1", ownerChatVerified: true, status: "waiting", expiresAtMs: 2, nowMs: 1, choice: "yes" as const };
    expect(aiTapDecision({ ...base, oneTap: false })).toBe("needs_site");
    expect(aiTapDecision({ ...base, oneTap: true })).toBe("approve");
    expect(aiTapDecision({ ...base, oneTap: true, tapChatId: "2" })).toBe("refuse");
    expect(aiTapDecision({ ...base, oneTap: true, nowMs: 3 })).toBe("expired");
  });
  test("override taps: keep holding works on a waiting day of any size, buy now only on a day with no trades yet", () => {
    const base = { signatureOk: true, privateChat: true, tapChatId: "1", ownerChatId: "1", ownerChatVerified: true, expiresAtMs: 2, nowMs: 1, oneTap: false };
    expect(aiTapDecision({ ...base, status: "waiting", choice: "keep" })).toBe("override");
    expect(aiTapDecision({ ...base, status: "waiting", choice: "keep", nowMs: 3 })).toBe("expired");
    expect(aiTapDecision({ ...base, status: "approved", choice: "keep" })).toBe("already_decided");
    expect(aiTapDecision({ ...base, status: "none", choice: "now" })).toBe("override");
    expect(aiTapDecision({ ...base, status: "waiting", choice: "now" })).toBe("already_decided");
    expect(aiTapDecision({ ...base, status: "none", choice: "now", tapChatId: "2" })).toBe("refuse");
    expect(aiTapDecision({ ...base, status: "none", choice: "no" })).toBe("stay");
  });
  test("an override button signed for one choice can't be replayed as another", async () => {
    const id = "7e56d426-a4aa-4ea5-8b33-579ab74d238f";
    const d = parseAiButton(await aiButtonData("k", "keep", id, "u1"))!;
    expect(d.choice).toBe("keep");
    expect(await aiButtonOk("k", { ...d, choice: "yes" }, "u1")).toBe(false);
  });
  test("buttons are bound to the owner", async () => {
    const id = "7e56d426-a4aa-4ea5-8b33-579ab74d238f";
    const d = parseAiButton(await aiButtonData("k", "yes", id, "u1"))!;
    expect(await aiButtonOk("k", d, "u1")).toBe(true);
    expect(await aiButtonOk("k", d, "u2")).toBe(false);
  });
});

describe("who may buy for real", () => {
  const link = { mode: "access", hasKey: true, pockets: ["TXC", "EVM", "BTC"] };
  const base = { isAdmin: true, adminExecutionOn: true, membersExecutionOn: false, planStatus: "locked", unroutableCoins: [], link, neededPockets: ["TXC", "EVM", "BTC"] };
  test("admins yes, members stay on paper", () => {
    expect(realBuyingBlocker(base)).toBeNull();
    expect(realBuyingBlocker({ ...base, isAdmin: false })).toContain("paper");
  });
  test("coins Seeds can't swap from TSD block it", () => {
    expect(realBuyingBlocker({ ...base, unroutableCoins: ["PLS"] })).toContain("PLS");
  });
});

describe("amount sent now", () => {
  test("a buy never spends more than the plan's TSD", () => {
    expect(moveAmountNow({ side: "buy", coin: "bitcoin", amount: 240 }, { tsd: 100, units: {} }, null)).toBe(100);
    expect(moveAmountNow({ side: "buy", coin: "bitcoin", amount: 240 }, { tsd: 5, units: {} }, null)).toBeNull();
  });
});
