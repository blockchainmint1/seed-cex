import { describe, expect, test } from "bun:test";
import {
  amountOwed, aprOf, canFund, canRepay, collateralNeeded, healthOf, isDefaulted, liquidationPrice, liquidationSplit, ltvPct,
  partiesFor, proposalActionProblem, returnSplit, SATS, SEEDS_DEFAULT_FEE_PCT, shouldLiquidate, signersFor, termsProblem, type LoanTerms,
} from "./rules";

const terms: LoanTerms = { coin: "TSD", collateralCoin: "TXC", amount: 1000, ratePct: 5, days: 90, startLtvPct: 50 };
const now = Date.parse("2026-11-22T18:00:00Z");
const marks = (prices: number[]) => prices.map((price, i) => ({ price, atMs: now - i * 5 * 60_000 }));

describe("loan terms", () => {
  test("interest is one flat % for the term: 1,000 at 5% → 1,050 owed", () => {
    expect(amountOwed(terms)).toBe(1050);
    expect(aprOf(5, 90)).toBeCloseTo(20.28, 2);
  });
  test("collateral covers what's owed at the starting loan-to-value", () => {
    // 1,050 owed at 50% LTV = $2,100 of TXC; at $0.70 → 3,000 TXC
    expect(collateralNeeded(terms, 0.7)).toBe(3000);
  });
  test("limits: 25 minimum, 7–365 days, LTV 10–70%, TXC collateral only", () => {
    expect(termsProblem(terms)).toBeNull();
    expect(termsProblem({ ...terms, amount: 10 })).not.toBeNull();
    expect(termsProblem({ ...terms, days: 400 })).not.toBeNull();
    expect(termsProblem({ ...terms, startLtvPct: 80 })).not.toBeNull();
    expect(termsProblem({ ...terms, collateralCoin: "BTC" as never })).not.toBeNull();
  });
});

describe("loan health", () => {
  test("margin call at 75%, liquidation at 85%", () => {
    expect(healthOf(74.9)).toBe("healthy");
    expect(healthOf(75)).toBe("margin_call");
    expect(healthOf(85)).toBe("liquidate");
    expect(ltvPct(1050, 3000, 0.7)).toBe(50);
    expect(liquidationPrice(1050, 3000)).toBeCloseTo(0.4118, 4);
  });
  test("one bad price can't liquidate: the median of 6 recent checks must agree", () => {
    const spike = marks([0.3, 0.7, 0.7, 0.7, 0.7, 0.7]);
    expect(shouldLiquidate(1050, 3000, spike, now)).toBe(false);
    const crash = marks([0.4, 0.4, 0.41, 0.4, 0.39, 0.7]);
    expect(shouldLiquidate(1050, 3000, crash, now)).toBe(true);
  });
  test("no liquidation on a stale price or too few checks", () => {
    const old = marks([0.3, 0.3, 0.3, 0.3, 0.3, 0.3]).map((m) => ({ ...m, atMs: m.atMs - 60 * 60_000 }));
    expect(shouldLiquidate(1050, 3000, old, now)).toBe(false);
    expect(shouldLiquidate(1050, 3000, marks([0.3, 0.3]), now)).toBe(false);
  });
  test("default only after the 72-hour grace period", () => {
    expect(isDefaulted(now - 71 * 3_600_000, now)).toBe(false);
    expect(isDefaulted(now - 73 * 3_600_000, now)).toBe(true);
  });
});

describe("Seeds' fee: only on liquidation or default, never from the lender", () => {
  test("3% of what's owed, paid from the borrower's leftover", () => {
    expect(SEEDS_DEFAULT_FEE_PCT).toBe(3);
    // 3,000 TXC at $0.40 = $1,200; owed $1,050 → lender 2,625 TXC, fee $31.50 = 78.75 TXC, borrower the rest
    const s = liquidationSplit({ collateralSats: 3000n * BigInt(SATS), owed: 1050, price: 0.4, networkFeeSats: 0n });
    expect(s.lenderSats).toBe(2625n * BigInt(SATS));
    expect(s.seedsFeeSats).toBe(7_875_000_000n);
    expect(s.lenderSats + s.seedsFeeSats + s.borrowerSats).toBe(3000n * BigInt(SATS));
  });
  test("if the lockbox is worth less than the debt, the lender gets everything and Seeds gets nothing", () => {
    const s = liquidationSplit({ collateralSats: 1000n * BigInt(SATS), owed: 1050, price: 0.5, networkFeeSats: 0n });
    expect(s.lenderSats).toBe(1000n * BigInt(SATS));
    expect(s.seedsFeeSats).toBe(0n);
    expect(s.borrowerSats).toBe(0n);
  });
  test("the network fee comes out of the borrower's share before the lender's", () => {
    const s = liquidationSplit({ collateralSats: 3000n * BigInt(SATS), owed: 1050, price: 0.4, networkFeeSats: 100_000n });
    expect(s.lenderSats).toBe(2625n * BigInt(SATS));
  });
  test("repaid or cancelled: the borrower gets it all back and Seeds takes nothing", () => {
    const s = returnSplit(3000n * BigInt(SATS), 100_000n);
    expect(s.seedsFeeSats).toBe(0n);
    expect(s.lenderSats).toBe(0n);
    expect(s.borrowerSats).toBe(3000n * BigInt(SATS) - 100_000n);
  });
  test("returns are signed by borrower + Seeds; liquidations by lender + Seeds", () => {
    expect(signersFor("release")).toEqual(["borrower", "seeds"]);
    expect(signersFor("liquidate")).toEqual(["lender", "seeds"]);
  });
});

describe("negotiation and steps", () => {
  const p = { status: "pending" as const, proposerId: "b", borrowerId: "b", lenderId: "l", expiresAtMs: now + 1000, round: 1 };
  test("only the other side can accept or counter; only the proposer can withdraw", () => {
    expect(proposalActionProblem(p, "l", "accept", now)).toBeNull();
    expect(proposalActionProblem(p, "b", "accept", now)).not.toBeNull();
    expect(proposalActionProblem(p, "b", "withdraw", now)).toBeNull();
    expect(proposalActionProblem(p, "x", "decline", now)).not.toBeNull();
    expect(proposalActionProblem(p, "l", "accept", now + 2000)).not.toBeNull();
  });
  test("the offer owner keeps their side", () => {
    expect(partiesFor({ side: "lend", userId: "l" }, "b")).toEqual({ lenderId: "l", borrowerId: "b" });
    expect(() => partiesFor({ side: "lend", userId: "l" }, "l")).toThrow();
  });
  test("no funding before collateral, no repay during a payout", () => {
    expect(canFund({ status: "awaiting_collateral", escrowPurpose: null, fundingTxid: null, fundingDeadlineMs: now + 1 }, now)).not.toBeNull();
    expect(canFund({ status: "awaiting_funding", escrowPurpose: null, fundingTxid: null, fundingDeadlineMs: now + 1 }, now)).toBeNull();
    expect(canRepay({ status: "active", escrowPurpose: "liquidate", repayTxid: null })).not.toBeNull();
    expect(canRepay({ status: "active", escrowPurpose: null, repayTxid: null })).toBeNull();
  });
});
