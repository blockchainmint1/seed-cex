import { describe, expect, test } from "bun:test";
import { addressSearchTerm, defaultDir, isSortKey, MAX_TSD_READS, pageInfo, pageOf, pageSize, tsdReadIds } from "./admin-accounts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("TSD is read only for the rows on screen", () => {
  test("never more than 100 balances per request", () => {
    expect(MAX_TSD_READS).toBe(100);
    expect(tsdReadIds(Array.from({ length: 500 }, (_, i) => id(i))).length).toBe(100);
  });
  test("bad and repeated ids are dropped", () => expect(tsdReadIds([id(1), id(1), "rob", 7, null])).toEqual([id(1)]));
  test("not a list reads nothing", () => expect(tsdReadIds("everyone")).toEqual([]));
});

describe("address search", () => {
  test("a pasted TXC address is looked up in lowercase", () => expect(addressSearchTerm(" TtXXgohUXU4bibYm4NPMsoezXx8zJGPirU ")).toBe("ttxxgohuxu4bibym4npmsoezxx8zjgpiru"));
  test("an EVM address works too", () => expect(addressSearchTerm("0xAbC123def")).toBe("0xabc123def"));
  test("under 6 characters only searches names and ids", () => expect(addressSearchTerm("rob")).toBeNull());
  test("spaces or symbols are never an address", () => {
    expect(addressSearchTerm("rob keating")).toBeNull();
    expect(addressSearchTerm("abc%def")).toBeNull();
  });
});

describe("sorting and pages", () => {
  test("TSD is not a whole-list sort (balances are read per page)", () => expect(isSortKey("tsd")).toBe(false));
  test("value sorts are allowed", () => expect(isSortKey("tradedQuoteValue")).toBe(true));
  test("names start A to Z, numbers biggest first", () => {
    expect(defaultDir("displayName")).toBe("asc");
    expect(defaultDir("trades")).toBe("desc");
  });
  test("rows per page is 25, 50 or 100", () => {
    expect(pageSize(50)).toBe(50);
    expect(pageSize(5000)).toBe(25);
  });
  test("69 accounts at 25 a page: page 3 shows 51–69", () => expect(pageInfo(69, 50, 25, 19)).toEqual({ page: 2, pages: 3, from: 51, to: 69 }));
  test("no rows still reads as page 1 of 1", () => expect(pageInfo(0, 0, 25, 0)).toEqual({ page: 0, pages: 1, from: 0, to: 0 }));
});

describe("client-side paging (smaller admin tables)", () => {
  const rows = Array.from({ length: 69 }, (_, i) => i);
  test("a page past the end snaps back to the last page", () => expect(pageOf(rows, 9, 25).page).toBe(2));
  test("no rows still reads as page 1 of 1", () => expect(pageOf([], 3, 25)).toMatchObject({ page: 0, pages: 1, from: 0, to: 0 }));
});
