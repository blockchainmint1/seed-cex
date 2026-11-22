import { describe, expect, test } from "bun:test";
import { COVER_FLAG_TTL_MS, COVER_RECHECK_MS, coverStrike, setAsidesByLeg, spendProblem, watchTotal } from "./set-asides";

const now = Date.parse("2026-11-22T23:00:00Z");

describe("audit C1: the order watch cancels only on a second sighting", () => {
  test("first shortfall only flags; nothing is cancelled", () => {
    expect(coverStrike(null, now)).toBe("flag");
  });
  test("still short a run later (45 s or more) → cancel", () => {
    expect(COVER_RECHECK_MS).toBe(45_000);
    expect(coverStrike(now - 60_000, now)).toBe("cancel");
  });
  test("a second look within 45 s doesn't count yet", () => {
    expect(coverStrike(now - 10_000, now)).toBe("flag");
  });
  test("a sighting older than 30 minutes is forgotten and starts over", () => {
    expect(COVER_FLAG_TTL_MS).toBe(30 * 60_000);
    expect(coverStrike(now - COVER_FLAG_TTL_MS - 1, now)).toBe("flag");
  });
});

describe("audit C3: withdrawals and swaps waiting for approval are 'going out'", () => {
  const s = setAsidesByLeg({ orders: [], unsentLegs: [], p2p: [], goingOut: [{ leg: "txc", amount: 40 }] }).txc!;
  test("40 TXC waiting to go out is set aside against new spends", () => {
    expect(s.goingOut).toBe(40);
    expect(s.total).toBe(40);
    expect(spendProblem({ symbol: "TXC", setAside: s, balances: [{ network: null, balance: 100 }], amount: 61 })).toContain("up to 60 TXC");
    expect(spendProblem({ symbol: "TXC", setAside: s, balances: [{ network: null, balance: 100 }], amount: 60 })).toBeNull();
  });
  test("the order watch leaves it out (orders were placed against what's left)", () => {
    const both = setAsidesByLeg({
      orders: [{ pair: "TSD_TXC", side: "sell", amount: 60, price: 0.1, filled: 0 }] as never,
      unsentLegs: [], p2p: [], goingOut: [{ leg: "txc", amount: 40 }],
    }).txc!;
    expect(both.total).toBe(100);
    expect(watchTotal(both)).toBe(60);
  });
});

describe("audit C5: USDC must cover its set-aside on one network", () => {
  test("60 on Ethereum + 60 on Base with 100 held → plain one-network message", () => {
    const s = { orders: 100, trades: 0, p2p: 0, goingOut: 0, total: 100, openOrders: 1 };
    const why = spendProblem({ symbol: "USDC", setAside: s, balances: [{ network: "ethereum", balance: 60 }, { network: "base", balance: 60 }], amount: 1, network: "base" });
    expect(why).toContain("100 USDC on a single network");
  });
});
