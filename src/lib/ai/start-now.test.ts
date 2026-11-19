import { describe, expect, test } from "bun:test";
import { defaultPlan } from "./plan";
import { buyNowTsd, canBuyNow, coinsWaiting, planWaitingInTsd } from "./start-now";

const btcPlan = { ...defaultPlan, mode: "basket" as const, coins: ["bitcoin"], weights: {}, exitMA: 50, reserve: 0 };

describe("when Seeds offers Buy now anyway", () => {
  test("a 100% BTC plan in TSD (BTC below its 50-day average) is waiting and can buy ~500 TSD now", () => {
    expect(coinsWaiting(btcPlan, {})).toEqual(["bitcoin"]);
    expect(planWaitingInTsd(btcPlan, {})).toBe(true);
    expect(canBuyNow(btcPlan, {})).toBe(true);
    expect(buyNowTsd(btcPlan, 500, {})).toBe(500);
  });
  test("a plan already holding its coins isn't waiting", () => {
    expect(planWaitingInTsd(btcPlan, { bitcoin: 1 })).toBe(false);
    expect(canBuyNow(btcPlan, { bitcoin: 1 })).toBe(false);
  });
  test("the always-in-TSD reserve is not counted as waiting, and isn't spent by buying now", () => {
    const withReserve = { ...btcPlan, reserve: 10 };
    expect(planWaitingInTsd(withReserve, { bitcoin: 0.9 })).toBe(false);
    expect(buyNowTsd(withReserve, 500, {})).toBe(450);
  });
  test("only the waiting part of a basket is bought now", () => {
    const basket = { ...btcPlan, coins: ["bitcoin", "ethereum"], weights: { bitcoin: 60, ethereum: 40 } };
    expect(coinsWaiting(basket, { bitcoin: 0.6 })).toEqual(["ethereum"]);
    expect(buyNowTsd(basket, 1000, { bitcoin: 0.6 })).toBe(400);
  });
  test("momentum plans can show the warning but don't offer Buy now anyway", () => {
    const mom = { ...btcPlan, mode: "momentum" as const };
    expect(planWaitingInTsd(mom, {})).toBe(true);
    expect(canBuyNow(mom, {})).toBe(false);
  });
});
