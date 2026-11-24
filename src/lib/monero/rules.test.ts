import { describe, expect, test } from "bun:test";
import { displayBalance, isMoneroAddress, moneroConfigured, previewFromDescribe, previewProblem, restoreHeight, unitsToXmr, watchWalletName, xmrToUnits, XMR_MAX_FEE } from "./rules";

const A = "4A4meFan68GQTKM2GJemCwBkfbVP2UsH2ZLPxWKquxhF93ruBpNL3PjSQzkKWFX5ELS8P4MKc4DVqb5sDFuswXJFCRuGsea";

describe("Monero rules", () => {
  test("1 XMR is 10^12 units", () => {
    expect(xmrToUnits(1)).toBe(1_000_000_000_000n);
    expect(unitsToXmr(1_500_000_000_000n)).toBe(1.5);
  });
  test("a real primary address passes; a typo fails the checksum", () => {
    expect(isMoneroAddress(A)).toBe(true);
    expect(isMoneroAddress(A.slice(0, -1) + (A.endsWith("a") ? "b" : "a"))).toBe(false);
    expect(isMoneroAddress("0x1234")).toBe(false);
  });
  test("wallet file names never contain the address", () => {
    expect(watchWalletName(A)).not.toContain(A.slice(0, 10));
    expect(watchWalletName(A)).toBe(watchWalletName(A));
  });
  test("scanning starts ~2 days before the link date", () => {
    const now = Date.UTC(2026, 10, 24);
    expect(restoreHeight(3_000_000, now - 24 * 3600 * 1000, now)).toBe(3_000_000 - 720 - 1440);
    expect(restoreHeight(100, 0, now)).toBe(0);
  });
  test("a built send is refused if address, amount or fee is off", () => {
    const ok = { amount: 5n, fee: 30_000_000n, destinations: [{ address: A, amount: 5n }] };
    expect(previewProblem(ok, { to: A, units: 5n })).toBeNull();
    expect(previewProblem({ ...ok, destinations: [{ address: A, amount: 6n }] }, { to: A, units: 5n })).toContain("different amount");
    expect(previewProblem(ok, { to: A.replace("4A", "4B"), units: 5n })).toContain("different address");
    expect(previewProblem({ ...ok, fee: xmrToUnits(XMR_MAX_FEE) + 1n }, { to: A, units: 5n })).toContain("unusually high");
  });
  test("the recipient is read from what will be signed, not from the request (Z2)", () => {
    const other = A.replace("4A", "4B");
    const p = previewFromDescribe({ desc: [{ recipients: [{ address: other, amount: 5 }], fee: 30_000_000, change_address: A, change_amount: 7 }] })!;
    expect(previewProblem(p, { to: A, units: 5n, from: A })).toContain("different address");
    const good = previewFromDescribe({ desc: [{ recipients: [{ address: other, amount: 5 }], fee: 30_000_000, change_address: A, change_amount: 7 }] })!;
    expect(previewProblem(good, { to: other, units: 5n, from: A })).toBeNull();
  });
  test("change to anyone but the pocket is refused", () => {
    const p = previewFromDescribe({ desc: [{ recipients: [{ address: A, amount: 5 }], fee: 30_000_000, change_address: A.replace("4A", "4C"), change_amount: 7 }] })!;
    expect(previewProblem(p, { to: A, units: 5n, from: A.replace("4A", "4D") })).toContain("change");
  });
  test("two transactions in one set, or malformed numbers, can't be read", () => {
    expect(previewFromDescribe({ desc: [] })).toBeNull();
    expect(previewFromDescribe({ desc: [{ recipients: [], fee: 1 }, { recipients: [], fee: 1 }] })).toBeNull();
    expect(previewFromDescribe({ desc: [{ recipients: [{ address: A, amount: -1 }], fee: 1 }] })).toBeNull();
  });
  test("locked coins show only as arriving", () => {
    expect(displayBalance(3_000_000_000_000n, 1_000_000_000_000n)).toEqual({ balance: 1, arriving: 2 });
  });
  test("the server counts as connected only with an https address and a long token", () => {
    expect(moneroConfigured({ url: "https://xmr.example", token: "x".repeat(32) })).toBe(true);
    expect(moneroConfigured({ url: "http://xmr.example", token: "x".repeat(32) })).toBe(false);
    expect(moneroConfigured({ url: "https://xmr.example", token: "short" })).toBe(false);
  });
});
