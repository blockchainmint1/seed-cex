import { describe, expect, test } from "bun:test";
import {
  committedOnLeg, failureCulprit, orderCoverProblem, ordersAfterFailedPreflight, payAmountOf, payLegOf,
  placeCheckNeedsLiveRead, REPEAT_FAILURE_LIMIT, repeatFailureMessage, repeatFailurePause,
} from "./order-readiness";

const T = { makerId: "maker", takerId: "taker", makerOrderId: "mo", takerOrderId: "to" };

describe("who pays an order", () => {
  test("on TXC/TSD a seller pays TXC, a buyer pays TSD", () => {
    expect(payLegOf("TSD_TXC", "sell")).toBe("txc");
    expect(payLegOf("TSD_TXC", "buy")).toBe("tsd");
  });
  test("a buy of 100 at 0.10 needs 10 of the quote coin; a sell of 100 needs 100", () => {
    expect(payAmountOf("buy", 100, 0.1)).toBeCloseTo(10, 8);
    expect(payAmountOf("sell", 100, 0.1)).toBe(100);
  });
  test("other open orders count only what's left unfilled, on the same coin", () => {
    const orders = [
      { pair: "TSD_TXC", side: "sell" as const, price: 0.2, amount: 10, filled: 5 },
      { pair: "TSD_TXC", side: "buy" as const, price: 0.1, amount: 50, filled: 0 },
    ];
    expect(committedOnLeg(orders, "txc")).toBe(5);
    expect(committedOnLeg(orders, "tsd")).toBeCloseTo(5, 8);
  });
});

describe("Place order balance check", () => {
  test("enough free balance places the order", () => {
    expect(orderCoverProblem({ symbol: "TXC", balance: 100, committed: 0, need: 100 })).toBeNull();
  });
  test("short balance is refused", () => {
    expect(orderCoverProblem({ symbol: "TXC", balance: 50, committed: 0, need: 100 })).not.toBeNull();
  });
  test("balance already promised to other open orders isn't free", () => {
    expect(orderCoverProblem({ symbol: "TXC", balance: 100, committed: 60, need: 50 })).toContain("other open orders");
  });
  test("an unreadable balance refuses rather than guesses", () => {
    expect(orderCoverProblem({ symbol: "TXC", balance: null, committed: 0, need: 1 })).not.toBeNull();
  });
});

describe("after a match is cancelled before anything moved", () => {
  test("the side that couldn't pay loses its order; the other goes back on the book", () => {
    expect(ordersAfterFailedPreflight(T, { fault: "payer", payer: "maker", receiver: "taker" })).toEqual({ cancel: ["mo"], restore: ["to"] });
    expect(ordersAfterFailedPreflight(T, { fault: "payer", payer: "taker", receiver: "maker" })).toEqual({ cancel: ["to"], restore: ["mo"] });
  });
  test("a side with no address to be paid into loses its order", () => {
    expect(ordersAfterFailedPreflight(T, { fault: "receiver", payer: "maker", receiver: "taker" })).toEqual({ cancel: ["to"], restore: ["mo"] });
  });
  test("when our servers didn't answer, nobody loses their order", () => {
    expect(ordersAfterFailedPreflight(T, { fault: "network", payer: "maker", receiver: "taker" })).toEqual({ cancel: [], restore: ["mo", "to"] });
  });
  test("a sample order with no owner comes off the book", () => {
    const t = { ...T, makerId: null };
    expect(ordersAfterFailedPreflight(t, { fault: "payer", payer: null, receiver: "taker" })).toEqual({ cancel: ["mo"], restore: ["to"] });
  });
});


describe("repeat failed matches pause placing orders (audit R2)", () => {
  const h = 3_600_000;
  const now = Date.UTC(2026, 10, 22, 12);
  test("two failures in a day: still allowed", () => {
    expect(repeatFailurePause({ failedAtMs: [now - 2 * h, now - h], clearedAtMs: null, nowMs: now }).paused).toBe(false);
  });
  test("three failures in a day: paused until the oldest is 24 hours old", () => {
    const r = repeatFailurePause({ failedAtMs: [now - 5 * h, now - 2 * h, now - h], clearedAtMs: null, nowMs: now });
    expect(REPEAT_FAILURE_LIMIT).toBe(3);
    expect(r.paused).toBe(true);
    expect(r.untilMs).toBe(now - 5 * h + 24 * h);
  });
  test("four failures: the pause lasts until only two are left in the window", () => {
    const r = repeatFailurePause({ failedAtMs: [now - 6 * h, now - 5 * h, now - 2 * h, now - h], clearedAtMs: null, nowMs: now });
    expect(r.untilMs).toBe(now - 5 * h + 24 * h);
  });
  test("failures older than 24 hours don't count", () => {
    expect(repeatFailurePause({ failedAtMs: [now - 30 * h, now - 2 * h, now - h], clearedAtMs: null, nowMs: now }).paused).toBe(false);
  });
  test("an admin's clear wipes the failures before it", () => {
    expect(repeatFailurePause({ failedAtMs: [now - 5 * h, now - 2 * h, now - h], clearedAtMs: now - 90 * 60_000, nowMs: now }).paused).toBe(false);
  });
  test("only the side at fault is counted; a network failure counts against nobody", () => {
    expect(failureCulprit({ fault: "payer", payer: "a", receiver: "b" })).toBe("a");
    expect(failureCulprit({ fault: "receiver", payer: "a", receiver: "b" })).toBe("b");
    expect(failureCulprit({ fault: "network", payer: "a", receiver: "b" })).toBeNull();
  });
  test("the message says when it ends", () => {
    expect(repeatFailureMessage(Date.UTC(2026, 10, 23, 7, 0))).toContain("until 2026-11-23 07:00 UTC");
  });
});

describe("place-order balance check may reuse a recent read (audit R3)", () => {
  test("a recent read can let an order through, but a refusal is always re-checked live", () => {
    expect(placeCheckNeedsLiveRead(null)).toBe(false);
    expect(placeCheckNeedsLiveRead("This order needs 10 TSD")).toBe(true);
  });
});
