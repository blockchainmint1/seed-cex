import { describe, expect, test } from "bun:test";
import { filterAccounts, pageOf, sortAccounts, type AccountRowLike } from "./admin-accounts";

const row = (o: Partial<AccountRowLike>): AccountRowLike => ({
  userId: "u", displayName: "x", createdAt: "2026-11-01T00:00:00Z", hasVault: false, txcAddress: null, evmAddress: null,
  activeAuthorizations: 0, authorizedCap: 0, openOrders: 0, trades: 0, tradedQuoteValue: 0, lastActivity: null, ...o,
});

describe("accounts search", () => {
  const rows = [
    row({ userId: "aaa-111", displayName: "Bobby", txcAddress: "TmGDPk9xyz" }),
    row({ userId: "bbb-222", displayName: "stephaniebartsch", evmAddress: "0xAbC123" }),
  ];
  test("matches name ignoring case", () => expect(filterAccounts(rows, "BOB").map((r) => r.displayName)).toEqual(["Bobby"]));
  test("matches a TXC or EVM address", () => {
    expect(filterAccounts(rows, "tmgdpk").map((r) => r.displayName)).toEqual(["Bobby"]);
    expect(filterAccounts(rows, "0xabc").map((r) => r.displayName)).toEqual(["stephaniebartsch"]);
  });
  test("matches a user id", () => expect(filterAccounts(rows, "bbb-2").length).toBe(1));
  test("blank search shows everyone", () => expect(filterAccounts(rows, "  ").length).toBe(2));
});

describe("accounts sort", () => {
  const rows = [
    row({ displayName: "carol", tradedQuoteValue: 5, lastActivity: null }),
    row({ displayName: "Alice", tradedQuoteValue: 50, lastActivity: "2026-11-10T00:00:00Z" }),
    row({ displayName: "bob", tradedQuoteValue: 20, lastActivity: "2026-11-18T00:00:00Z" }),
  ];
  test("names sort A to Z ignoring case", () => expect(sortAccounts(rows, "displayName", "asc").map((r) => r.displayName)).toEqual(["Alice", "bob", "carol"]));
  test("value sorts biggest first and flips", () => {
    expect(sortAccounts(rows, "tradedQuoteValue", "desc").map((r) => r.tradedQuoteValue)).toEqual([50, 20, 5]);
    expect(sortAccounts(rows, "tradedQuoteValue", "asc").map((r) => r.tradedQuoteValue)).toEqual([5, 20, 50]);
  });
  test("no activity stays at the bottom both ways", () => {
    expect(sortAccounts(rows, "lastActivity", "desc").map((r) => r.displayName)).toEqual(["bob", "Alice", "carol"]);
    expect(sortAccounts(rows, "lastActivity", "asc").map((r) => r.displayName)).toEqual(["Alice", "bob", "carol"]);
  });
});

describe("accounts paging", () => {
  const rows = Array.from({ length: 69 }, (_, i) => i);
  test("69 accounts at 25 a page is 3 pages, last page shows 51–69", () => {
    const p = pageOf(rows, 2, 25);
    expect(p.pages).toBe(3);
    expect([p.from, p.to, p.rows.length]).toEqual([51, 69, 19]);
  });
  test("a page past the end snaps back to the last page", () => expect(pageOf(rows, 9, 25).page).toBe(2));
  test("no rows still reads as page 1 of 1", () => expect(pageOf([], 3, 25)).toMatchObject({ page: 0, pages: 1, from: 0, to: 0 }));
});

describe("accounts sort by TSD", () => {
  const rows = [
    row({ displayName: "unlinked", tsd: null }),
    row({ displayName: "small", tsd: 2 }),
    row({ displayName: "big", tsd: 400 }),
  ];
  test("biggest TSD first, unread balances last", () => expect(sortAccounts(rows, "tsd", "desc").map((r) => r.displayName)).toEqual(["big", "small", "unlinked"]));
  test("flipped, unread balances still last", () => expect(sortAccounts(rows, "tsd", "asc").map((r) => r.displayName)).toEqual(["small", "big", "unlinked"]));
});
