import { describe, expect, test } from "bun:test";
import { ORDER_TAP_TTL_MS, fillFromOrderProblem, fillPriceAllowed, orderApprovalCap, orderTapText, type OrderApprovalView } from "./rules";

const approval: OrderApprovalView = {
  status: "approved", expiresAtMs: 2_000, userId: "u1", linkId: "l1", fromAddress: "Taddr", leg: "tsd",
  cap: 10, side: "buy", limitPrice: 0.1,
};
const fill = { userId: "u1", linkId: "l1", fromAddress: "Taddr", leg: "tsd", amount: 5, price: 0.1, side: "buy" as const, nowMs: 1_000, alreadyCommitted: 0 };

describe("order approval", () => {
  test("a sell approves its size; a buy approves size x price", () => {
    expect(orderApprovalCap("sell", 150, 0.1)).toBe(150);
    expect(orderApprovalCap("buy", 150, 0.1)).toBeCloseTo(15, 10);
  });
  test("fills only at the order's price or better", () => {
    expect(fillPriceAllowed("buy", 0.09, 0.1)).toBe(true);
    expect(fillPriceAllowed("buy", 0.11, 0.1)).toBe(false);
    expect(fillPriceAllowed("sell", 0.11, 0.1)).toBe(true);
    expect(fillPriceAllowed("sell", 0.09, 0.1)).toBe(false);
  });
  test("one tap pays every fill until the approved total is used", () => {
    expect(fillFromOrderProblem(approval, fill)).toBeNull();
    expect(fillFromOrderProblem(approval, { ...fill, alreadyCommitted: 5 })).toBeNull();
    expect(fillFromOrderProblem(approval, { ...fill, alreadyCommitted: 5.01 })).toMatch(/more than the order approved/);
  });
  test("a cancelled or expired approval, another member, or a changed pocket pays nothing", () => {
    expect(fillFromOrderProblem(null, fill)).toMatch(/never approved/);
    expect(fillFromOrderProblem({ ...approval, status: "cancelled" }, fill)).toMatch(/ended/);
    expect(fillFromOrderProblem({ ...approval, status: "pending" }, fill)).toMatch(/ended/);
    expect(fillFromOrderProblem(approval, { ...fill, nowMs: 2_000 })).toMatch(/ended/);
    expect(fillFromOrderProblem(approval, { ...fill, userId: "u2" })).toMatch(/someone else/);
    expect(fillFromOrderProblem(approval, { ...fill, linkId: "l2" })).toMatch(/pocket changed/);
    expect(fillFromOrderProblem(approval, { ...fill, fromAddress: "Tother" })).toMatch(/pocket changed/);
    expect(fillFromOrderProblem(approval, { ...fill, leg: "txc" })).toMatch(/different coin/);
    expect(fillFromOrderProblem(approval, { ...fill, price: 0.2 })).toMatch(/worse/);
  });
  test("a market order must be approved within 3 minutes, a limit order within 15", () => {
    expect(ORDER_TAP_TTL_MS.market).toBe(180_000);
    expect(ORDER_TAP_TTL_MS.limit).toBe(900_000);
  });
  test("the tap names the most that can leave the pocket", () => {
    const t = orderTapText({ side: "sell", orderType: "limit", amount: 150, price: 0.1, baseSymbol: "TXC", quoteSymbol: "TSD", pair: "TXC/TSD", reference: null, warning: null });
    expect(t.capLine).toContain("Up to 150 TXC");
  });
});

describe("orders placed before order taps", () => {
  test("only owned orders with no placement tap are picked", async () => {
    const { ordersNeedingReapproval } = await import("./rules");
    const picked = ordersNeedingReapproval(
      [{ id: "old", userId: "u1" }, { id: "tapped", userId: "u1" }, { id: "sample", userId: null }],
      new Set(["tapped"]),
    );
    expect(picked).toEqual(["old"]);
  });
  test("the note lists what's left of each order and says nothing was sent", async () => {
    const { reapprovalNote } = await import("./rules");
    const text = reapprovalNote([{ side: "sell", amount: 150, filled: 50, price: 0.1, baseSymbol: "TXC", quoteSymbol: "TSD" }]);
    expect(text).toContain("Sell 100 TXC at 0.1 TSD");
    expect(text).toContain("Nothing was sent");
  });
});

describe("audit O1: the minute job keeps approved orders moving", () => {
  const base = { reqStatus: "pending", workingUntilMs: null, approvalStatus: "approved", approvalExpiresAtMs: 10_000, orderExists: false, nowMs: 1_000 };
  test("an approved order nobody placed gets placed", async () => {
    const { orderSweepAction } = await import("./rules");
    expect(orderSweepAction(base)).toBe("place");
  });
  test("a tap still waiting is left alone", async () => {
    const { orderSweepAction } = await import("./rules");
    expect(orderSweepAction({ ...base, approvalStatus: "pending" })).toBe("wait");
  });
  test("a market order whose 5 minutes ran out is ended, not placed late", async () => {
    const { orderSweepAction } = await import("./rules");
    expect(orderSweepAction({ ...base, approvalExpiresAtMs: 500 })).toBe("end");
  });
  test("a worker still inside its lease is left alone", async () => {
    const { orderSweepAction } = await import("./rules");
    expect(orderSweepAction({ ...base, reqStatus: "placing", workingUntilMs: 2_000 })).toBe("wait");
  });
  test("a dead worker that already matched is finished, never matched twice", async () => {
    const { orderSweepAction } = await import("./rules");
    expect(orderSweepAction({ ...base, reqStatus: "placing", workingUntilMs: 500, orderExists: true })).toBe("finish_placed");
  });
  test("a dead worker that never matched is retried", async () => {
    const { orderSweepAction } = await import("./rules");
    expect(orderSweepAction({ ...base, reqStatus: "placing", workingUntilMs: 500 })).toBe("place");
  });
});

describe("audit O2: an ended approval is not the member's fault", () => {
  test("cancelled by Seeds, expired or relinked → no strike; wrong price → strike", async () => {
    const { approvalEndedNotMemberFault } = await import("./rules");
    expect(approvalEndedNotMemberFault({ ...approval, status: "cancelled" }, fill)).toBe(true);
    expect(approvalEndedNotMemberFault({ ...approval, expiresAtMs: 500 }, fill)).toBe(true);
    expect(approvalEndedNotMemberFault(approval, { ...fill, linkId: "l2" })).toBe(true);
    expect(approvalEndedNotMemberFault(approval, { ...fill, price: 0.2 })).toBe(false);
  });
});
