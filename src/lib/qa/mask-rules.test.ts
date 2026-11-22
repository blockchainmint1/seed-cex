import { describe, expect, test } from "bun:test";
import { maskedColumns, screenshotBlocked, sensitiveRanges } from "./mask-rules";

const hidden = (t: string) => sensitiveRanges(t).map(([a, b]) => t.slice(a, b));

describe("no page screenshot on coin sign-in, Security and Withdraw", () => {
  test("blocked pages", () => {
    expect(screenshotBlocked("/key-signin")).toBe(true);
    expect(screenshotBlocked("/account/security")).toBe(true);
    expect(screenshotBlocked("/account/security/")).toBe(true);
    expect(screenshotBlocked("/account/balances/withdraw")).toBe(true);
    expect(screenshotBlocked("/link-account")).toBe(true);
  });
  test("other pages keep it", () => {
    expect(screenshotBlocked("/swap")).toBe(false);
    expect(screenshotBlocked("/account/balances")).toBe(false);
    expect(screenshotBlocked("/account/securityx")).toBe(false);
  });
});

describe("addresses, keys and codes are blacked out", () => {
  test("wallet addresses and keys", () => {
    expect(hidden("Send to 0x52908400098527886E0F7030069857D2E4169EE7 now")).toEqual(["0x52908400098527886E0F7030069857D2E4169EE7"]);
    expect(hidden("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")).toEqual(["bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"]);
    expect(hidden("Key: JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP")).toEqual(["JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"]);
  });
  test("shortened addresses", () => {
    expect(hidden("Coin Tt85…eXMR linked")).toEqual(["Tt85…eXMR"]);
    expect(hidden("from 0x12ab...cd34")).toEqual(["0x12ab...cd34"]);
  });
  test("six-digit codes, but not prices or long words", () => {
    expect(hidden("Your code is 482913")).toEqual(["482913"]);
    expect(hidden("Your code is 482 913")).toEqual(["482 913"]);
    expect(hidden("Price 1,234,567.89 and 1234567.5")).toEqual([]);
    expect(hidden("internationalizationprocess")).toEqual([]);
  });
  test("amount after a balance label", () => {
    expect(hidden("Balance: 12.5 BTC")).toEqual(["12.5"]);
    expect(hidden("In your pocket now: $1,250.40")).toEqual(["$1,250.40"]);
    expect(hidden("Available: 3")).toEqual(["3"]);
  });
});

describe("balance columns in tables", () => {
  test("holding columns and their value column", () => {
    expect(maskedColumns(["Coin", "Network", "Balance", "Value", "Actions"])).toEqual([2, 3]);
    expect(maskedColumns(["Asset", "Network", "In pocket", "Receive"])).toEqual([2]);
  });
  test("market tables keep their numbers", () => {
    expect(maskedColumns(["Market", "Price", "24h", "Value"])).toEqual([]);
  });
});
