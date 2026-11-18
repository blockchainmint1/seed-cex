import { describe, expect, test } from "bun:test";
import { swapCoin } from "./assets";
import {
  afterBridgeFee, BRIDGE_USDC_CONTRACT, bridgeProgress, gasTopUpWei, GAS_LIMITS, legPriceOk, mintOrderProblem,
  redeemOrderProblem, routeBlocker, routeCoinProblem, routePockets, routeSteps, stepIndex, TSD_ROUTE,
} from "./tsd-route";
import { SWAP_LIMITS } from "./send-rules";

const c = (id: string) => swapCoin(id)!;
const all = { mode: "access", hasKey: true, pockets: ["TXC", "EVM", "BTC", "LTC", "DOGE", "SOL"] };
const EVM_POCKET = "0x1111111111111111111111111111111111111111";
const TXC_POCKET = "TiwXXpo37QWNnykS1LTHVfmJArTvSETNX5";
const goodRedeem = {
  id: "8f0b5b3e-5d0c-4d33-9d1a-9d6f2d6d1a11", depositAddress: "TqC3cMKoJmGPg7m1xZgUCc6v7GypG3qJ5d", payoutAddress: EVM_POCKET,
  chain: "ethereum", amountExpected: 50, feeBps: 0, memo: null,
};

describe("which coins a TSD swap can reach", () => {
  test("buy: any THORChain coin the pocket can hold", () => {
    for (const id of ["BTC", "ETH", "LTC", "DOGE", "SOL", "XRP", "USDC"]) expect(routeCoinProblem("buy", c(id))).toBeNull();
  });
  test("buy: a coin the pocket can't hold is refused", () => {
    expect(routeCoinProblem("buy", c("ATOM"))).toMatch(/can't hold/);
  });
  test("sell: only coins Seeds can send from the pocket", () => {
    expect(routeCoinProblem("sell", c("BTC"))).toBeNull();
    expect(routeCoinProblem("sell", c("ZEC"))).toMatch(/can't send/);
  });
  test("every route needs the TXC pocket (TSD) and the EVM pocket (USDC in between)", () => {
    expect(routePockets("buy", c("BTC")).sort()).toEqual(["BTC", "EVM", "TXC"]);
    expect(routePockets("sell", c("USDC")).sort()).toEqual(["EVM", "TXC"]);
  });
});

describe("who can start a TSD swap", () => {
  const base = { direction: "buy" as const, coin: c("BTC"), link: all, isAdmin: true, amountUsd: 50, tsdAmount: 50 };
  test("pilot: members who aren't admins wait", () => {
    expect(routeBlocker({ ...base, isAdmin: false })).toMatch(/test/);
  });
  test("approve-every-trade links can't", () => {
    expect(routeBlocker({ ...base, link: { ...all, mode: "approve" } })).toMatch(/instant access/);
  });
  test("a pocket missing the EVM key can't", () => {
    expect(routeBlocker({ ...base, link: { ...all, pockets: ["TXC", "BTC"] } })).toMatch(/missing EVM/);
  });
  test(`under the bridge minimum of ${TSD_ROUTE.minTsd} TSD is refused`, () => {
    expect(TSD_ROUTE.minTsd).toBe(10);
    expect(routeBlocker({ ...base, tsdAmount: 9.99 })).toMatch(/minimum is 10/);
  });
  test(`same $${SWAP_LIMITS.perSwapUsd} per-swap cap as other swaps`, () => {
    expect(routeBlocker({ ...base, amountUsd: 251 })).toMatch(/\$250/);
    expect(routeBlocker({ ...base, amountUsd: 250 })).toBeNull();
  });
});

describe("TSD Bridge answers are checked before any coin moves", () => {
  const want = { payout: EVM_POCKET, amount: 50, maxFeeBps: 0 };
  test("a correct cash-out order passes (address case doesn't matter)", () => {
    expect(redeemOrderProblem({ ...goodRedeem, payoutAddress: EVM_POCKET.toUpperCase().replace("0X", "0x") }, want)).toBeNull();
  });
  test("paying any other address is refused", () => {
    expect(redeemOrderProblem({ ...goodRedeem, payoutAddress: "0x2222222222222222222222222222222222222222" }, want)).toMatch(/different address/);
  });
  test("a fee above the one shown is refused", () => {
    expect(redeemOrderProblem({ ...goodRedeem, feeBps: 50 }, want)).toMatch(/fee/);
  });
  test("a different amount, network, memo or deposit address is refused", () => {
    expect(redeemOrderProblem({ ...goodRedeem, amountExpected: 49 }, want)).toMatch(/amount/);
    expect(redeemOrderProblem({ ...goodRedeem, chain: "base" }, want)).toMatch(/network/);
    expect(redeemOrderProblem({ ...goodRedeem, memo: "x" }, want)).toMatch(/memo/);
    expect(redeemOrderProblem({ ...goodRedeem, depositAddress: "txc1qnotlegacy" }, want)).toMatch(/deposit address/);
  });
  test("a mint order must issue TSD to the member's own TXC pocket for Ethereum USDC", () => {
    const o = { id: "x", depositAddress: EVM_POCKET, recipient: TXC_POCKET, depositTokenContract: BRIDGE_USDC_CONTRACT.toUpperCase().replace("0X", "0x"), mintFeeBps: 0 };
    expect(mintOrderProblem(o, { recipient: TXC_POCKET, maxFeeBps: 0 })).toBeNull();
    expect(mintOrderProblem({ ...o, recipient: "TqC3cMKoJmGPg7m1xZgUCc6v7GypG3qJ5d" }, { recipient: TXC_POCKET, maxFeeBps: 0 })).toMatch(/different address/);
    expect(mintOrderProblem({ ...o, depositTokenContract: "0xdac17f958d2ee523a2206206994597c13d831ec7" }, { recipient: TXC_POCKET, maxFeeBps: 0 })).toMatch(/USDC/);
  });
  test("'paid' needs the payout transaction, not just a status", () => {
    expect(bridgeProgress({ status: "released" }, "buy")).toBe("waiting");
    expect(bridgeProgress({ status: "released", releaseTxHash: "0xabc" }, "buy")).toBe("paid");
    expect(bridgeProgress({ status: "released", mintTxid: "ab12" }, "sell")).toBe("paid");
    expect(bridgeProgress({ status: "paying", refundTxid: "r1" }, "buy")).toBe("refunded");
    expect(bridgeProgress({ status: "expired" }, "buy")).toBe("failed");
  });
});

describe("amounts and price drift", () => {
  test("0% bridge fee: 50 TSD becomes 50 USDC", () => {
    expect(afterBridgeFee(50, 0)).toBe(50);
  });
  test("a 1% fee is taken off, rounded down", () => {
    expect(afterBridgeFee(100, 100)).toBe(99);
  });
  test(`the THORChain step may run up to ${TSD_ROUTE.legTolerance * 100}% below the price shown, scaled to the actual amount`, () => {
    expect(TSD_ROUTE.legTolerance).toBe(0.02);
    expect(legPriceOk(0.001, 50, 50, 0.00098)).toBe(true);
    expect(legPriceOk(0.001, 50, 50, 0.000979)).toBe(false);
    expect(legPriceOk(0.001, 50, 25, 0.00049)).toBe(true);
  });
});

describe("Seeds gas wallet", () => {
  test(`caps: $${GAS_LIMITS.perRouteUsd} per swap, $${GAS_LIMITS.dailyUsd} a day`, () => {
    expect(GAS_LIMITS).toEqual({ perRouteUsd: 5, dailyUsd: 100 });
  });
  test("sends only the shortfall, nothing when the pocket can already pay", () => {
    expect(gasTopUpWei(1000n, 400n)).toBe(600n);
    expect(gasTopUpWei(1000n, 1000n)).toBe(0n);
  });
});

describe("progress tracker", () => {
  test("buy BTC: four steps, bridging is step 2", () => {
    expect(routeSteps("buy", "BTC")).toHaveLength(4);
    expect(stepIndex("buy", "bridging", false)).toBe(1);
    expect(stepIndex("buy", "swap_sent", false)).toBe(2);
    expect(stepIndex("buy", "done", false)).toBe(4);
  });
  test("TSD -> USDC has no THORChain step", () => {
    expect(routeSteps("buy", "USDC")).toHaveLength(3);
    expect(stepIndex("buy", "done", true)).toBe(3);
  });
  test("sell BTC: swap first, then TSD Bridge", () => {
    expect(stepIndex("sell", "swapping", false)).toBe(0);
    expect(stepIndex("sell", "swap_sent", false)).toBe(1);
    expect(stepIndex("sell", "bridging", false)).toBe(2);
  });
});
