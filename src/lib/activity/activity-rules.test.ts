import { describe, expect, test } from "bun:test";
import {
  activityCsv, coinsIn, dexTone, filterRows, hiddenLegs, mySide, p2pTone, parseSwapRef, routeTone, swapHref, tradeTone, twoTone, withdrawTone, approvalWaiting,
  type ActivityRow,
} from "./activity-rules";

const row = (o: Partial<ActivityRow>): ActivityRow => ({
  id: "x", kind: "swap", at: "2026-11-20T10:00:00.000Z", title: "t", detail: null, sent: null, got: null, status: "s", tone: "done", href: null, txUrl: null, ...o,
});

describe("activity rows", () => {
  test("a fill is the taker's side; the maker did the opposite", () => {
    expect(mySide("buy", "taker")).toBe("buy");
    expect(mySide("buy", "maker")).toBe("sell");
    expect(mySide("sell", "maker")).toBe("buy");
  });

  test("a swap's inner steps are never listed as their own swaps", () => {
    const h = hiddenLegs({
      tsdRoutes: [{ swap_send_id: "s1" }, { swap_send_id: null }],
      twoSteps: [{ swap_send_id: "s2", leg2_swap_send_id: "s3" }],
      dexSwaps: [{ id: "d1", tsd_route_id: "r1", two_step_id: null }, { id: "d2", tsd_route_id: null, two_step_id: "w1" }, { id: "d3", tsd_route_id: null, two_step_id: null }],
    });
    expect([...h.sends].sort()).toEqual(["s1", "s2", "s3"]);
    expect([...h.routes]).toEqual(["r1"]);
    expect([...h.dex]).toEqual(["d2"]);
  });

  test("waiting on the member is flagged as needing action", () => {
    expect(p2pTone("open", "buyer")).toBe("action");
    expect(p2pTone("open", "seller")).toBe("pending");
    expect(p2pTone("paid", "seller")).toBe("action");
    expect(dexTone("awaiting_approval")).toBe("action");
    expect(twoTone("awaiting_approval")).toBe("action");
    expect(withdrawTone("approving")).toBe("action");
    expect(routeTone("needs_ok")).toBe("action");
    expect(tradeTone("disputed")).toBe("action");
  });

  test("stopped swaps never read as done", () => {
    expect(twoTone("kept_mid")).toBe("stopped");
    expect(dexTone("kept_usdc")).toBe("stopped");
    expect(routeTone("refunded")).toBe("stopped");
    expect(tradeTone("settled")).toBe("done");
    expect(tradeTone("both_funded")).toBe("pending");
  });

  test("an expired Telegram request is no longer waiting", () => {
    const now = Date.parse("2026-11-22T12:00:00Z");
    expect(approvalWaiting({ status: "pending", expires_at: "2026-11-22T12:05:00Z" }, now)).toBe(true);
    expect(approvalWaiting({ status: "pending", expires_at: "2026-11-22T11:59:00Z" }, now)).toBe(false);
    expect(approvalWaiting({ status: "approved", expires_at: "2026-11-22T12:05:00Z" }, now)).toBe(false);
  });

  test("filters by type, coin, status and whole days", () => {
    const rows = [
      row({ id: "a", kind: "swap", sent: { amount: 1, coin: "BTC" }, at: "2026-11-20T23:59:00Z" }),
      row({ id: "b", kind: "deposit", got: { amount: 5, coin: "TSD" }, at: "2026-11-21T00:01:00Z", tone: "pending" }),
    ];
    expect(filterRows(rows, { kinds: ["deposit"] }).map((r) => r.id)).toEqual(["b"]);
    expect(filterRows(rows, { coin: "btc" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterRows(rows, { tones: ["pending"] }).map((r) => r.id)).toEqual(["b"]);
    expect(filterRows(rows, { from: "2026-11-20", to: "2026-11-20" }).map((r) => r.id)).toEqual(["a"]);
    expect(coinsIn(rows)).toEqual(["BTC", "TSD"]);
  });

  test("CSV quotes commas and defuses spreadsheet formulas", () => {
    const csv = activityCsv([row({ title: "Swap, then", detail: "=HYPERLINK(1)", sent: { amount: -1, coin: "BTC" } })]);
    const line = csv.split("\n")[1]!;
    expect(line).toContain('"Swap, then — =HYPERLINK(1)"');
    expect(activityCsv([row({ title: "=cmd" })]).split("\n")[1]).toContain("'=cmd");
    expect(line).toContain(",-1,BTC,");
  });
});

test("a one-tap chain's steps are hidden; the chain row stands alone", () => {
  const h = hiddenLegs({
    tsdRoutes: [{ id: "r1", swap_send_id: "s1", parent_id: "chain" }, { id: "r2", swap_send_id: null, parent_id: null }],
    sends: [{ id: "s2", parent_id: "chain" }, { id: "s3", parent_id: null }],
    twoSteps: [], dexSwaps: [],
  });
  expect(h.routes.has("r1")).toBe(true);
  expect(h.routes.has("r2")).toBe(false);
  expect(h.sends.has("s2")).toBe(true);
  expect(h.sends.has("s3")).toBe(false);
});

test("a history row links to its own record on the Swap page", () => {
  expect(swapHref("chain", "9f1c2b3a-0000-4000-8000-000000000000")).toBe("/swap?sw=chain:9f1c2b3a-0000-4000-8000-000000000000");
  const back = parseSwapRef("relay:9f1c2b3a-0000-4000-8000-000000000000");
  expect(back).toEqual({ kind: "relay", id: "9f1c2b3a-0000-4000-8000-000000000000" });
  // Anything the Swap page has no record for is refused, never trusted.
  expect(parseSwapRef("chain:../../etc/passwd")).toBeNull();
  expect(parseSwapRef("nonsense:9f1c2b3a-0000-4000-8000-000000000000")).toBeNull();
  expect(parseSwapRef("chain")).toBeNull();
  expect(parseSwapRef(undefined)).toBeNull();
});
