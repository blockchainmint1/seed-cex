import { describe, expect, test } from "bun:test";
import { errorAlertText, errorReportAllowed, hostKind, ignoredError, scrubErrorMessage, scrubErrorSource, signatureBase } from "./error-log-rules";

describe("error messages never keep money details", () => {
  test("addresses, amounts, links and emails are removed", () => {
    expect(scrubErrorMessage("Couldn't send 0.5 ETH to 0x52908400098527886E0F7030069857D2E4169EE7")).toBe("Couldn't send # ETH to [hidden]");
    expect(scrubErrorMessage("fetch https://api.example.com/x?key=abc failed for bob@mail.com")).toBe("fetch [link] failed for [email]");
    expect(scrubErrorMessage("code 482913 rejected")).toBe("code [hidden] rejected");
    expect(scrubErrorMessage("Pool 12345 has 1,200.75 left")).toBe("Pool # has # left");
  });
  test("capped at 500 characters, one line", () => {
    expect(scrubErrorMessage("a\nb")).toBe("a b");
    expect(scrubErrorMessage("x ".repeat(400)).length).toBe(500);
  });
});

describe("where errors are reported from", () => {
  test("never from sign-in, key, security, withdrawal or admin pages", () => {
    for (const p of ["/auth", "/sso", "/key-signin", "/account/security", "/account/balances/withdraw", "/admin/bugs"]) expect(errorReportAllowed(p)).toBe(false);
  });
  test("other pages report", () => {
    expect(errorReportAllowed("/swap")).toBe(true);
    expect(errorReportAllowed("/account/balances")).toBe(true);
    expect(errorReportAllowed("/authors")).toBe(true);
  });
  test("browser noise is dropped", () => {
    expect(ignoredError("Script error.")).toBe(true);
    expect(ignoredError("ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(ignoredError("Cannot read properties of undefined (reading 'price')")).toBe(false);
  });
});

describe("script location", () => {
  test("only Seeds' own files, without query", () => {
    expect(scrubErrorSource("https://seeds.honest.money/assets/index-Ab12.js?v=1#x", 12, 345, "https://seeds.honest.money")).toBe("/assets/index-Ab12.js:12:345");
    expect(scrubErrorSource("https://evil.example/x.js", 1, 1, "https://seeds.honest.money")).toBe("[outside script]");
    expect(scrubErrorSource(undefined, 1, 1, "https://seeds.honest.money")).toBe("");
  });
});

describe("grouping and alerts", () => {
  test("same error with different numbers groups together", () => {
    expect(signatureBase("error", "Row 12 missing")).toBe(signatureBase("error", "Row 99 missing"));
    expect(signatureBase("error", "x")).not.toBe(signatureBase("rejection", "x"));
  });
  test("site kind", () => {
    const live = new Set(["seeds.honest.money"]);
    expect(hostKind("seeds.honest.money", live)).toBe("live");
    expect(hostKind("id-preview--abc.lovable.app", live)).toBe("preview");
    expect(hostKind("evil.example", live)).toBe("other");
  });
  test("alert text is escaped", () => {
    expect(errorAlertText({ back: false, message: "<b>x</b>", pagePath: "/swap", host: "live", device: "Chrome 131", link: "https://seeds.honest.money/admin/bugs/errors" })).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
