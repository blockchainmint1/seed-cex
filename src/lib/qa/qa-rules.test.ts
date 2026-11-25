import { describe, expect, test } from "bun:test";
import {
  QA_GROUP_EXCERPT, QA_REPORTS_PER_HOUR, cleanText, groupReportText, groupStatusText, reportLink, validTelegramChatId, describeDevice, duplicateProblem, fileProblem, parseRef, qaCsv, refLabel, retestResult, scrubPagePath, viewportLabel,
} from "./qa-rules";

describe("page address never keeps codes or tokens", () => {
  test("drops the hash and every query key not on the safe list", () => {
    expect(scrubPagePath("https://seeds.honest.money/sso?ticket=abc123&redirect=/x#access_token=zzz")).toBe("/sso");
    expect(scrubPagePath("https://seeds.honest.money/activity?tab=deposits&code=123456")).toBe("/activity?tab=deposits");
  });
  test("hides long token-looking path pieces", () => {
    expect(scrubPagePath("/key-signin/claim/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef")).toBe("/key-signin/claim/[hidden]");
    expect(scrubPagePath("/markets/bitcoin")).toBe("/markets/bitcoin");
  });
});

describe("device details", () => {
  test("keeps only browser and OS names", () => {
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1")).toEqual({ browser: "Safari 17", os: "iOS 17" });
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0")).toEqual({ browser: "Edge 131", os: "Windows" });
    expect(viewportLabel(1495, 907, 1)).toBe("1495x907@1");
    expect(viewportLabel(NaN, 907, 1)).toBe("");
  });
});

describe("attachments", () => {
  test("screenshots are images up to 10 MB", () => {
    expect(fileProblem("screenshot", "image/png", 5_000_000)).toBeNull();
    expect(fileProblem("screenshot", "image/png", 11 * 1024 * 1024)).not.toBeNull();
    expect(fileProblem("screenshot", "application/pdf", 1000)).not.toBeNull();
  });
  test("recordings are video up to 25 MB, and can be switched off", () => {
    expect(fileProblem("recording", "video/webm;codecs=vp9", 20 * 1024 * 1024)).toBeNull();
    expect(fileProblem("recording", "video/webm", 26 * 1024 * 1024)).not.toBeNull();
    expect(fileProblem("recording", "video/webm", 1000, false)).not.toBeNull();
  });
  test("other files: images, PDF, text only", () => {
    expect(fileProblem("file", "application/pdf", 1000)).toBeNull();
    expect(fileProblem("file", "application/zip", 1000)).not.toBeNull();
    expect(fileProblem("file", "text/html", 1000)).not.toBeNull();
  });
});

describe("workflow", () => {
  test("a tester's retest answer only applies to Ready for retest", () => {
    expect(retestResult("ready_for_retest", true)).toBe("verified");
    expect(retestResult("ready_for_retest", false)).toBe("investigating");
    expect(retestResult("fixed", true)).toBeNull();
  });
  test("duplicates point at one original report", () => {
    expect(duplicateProblem({ id: "a", hasDuplicates: false }, { id: "b", duplicate_of: null })).toBeNull();
    expect(duplicateProblem({ id: "a", hasDuplicates: false }, { id: "a", duplicate_of: null })).not.toBeNull();
    expect(duplicateProblem({ id: "a", hasDuplicates: false }, { id: "b", duplicate_of: "c" })).not.toBeNull();
    expect(duplicateProblem({ id: "a", hasDuplicates: true }, { id: "b", duplicate_of: null })).not.toBeNull();
  });
  test("20 reports an hour per tester", () => {
    expect(QA_REPORTS_PER_HOUR).toBe(20);
  });
  test("report numbers", () => {
    expect(refLabel(42)).toBe("QA-0042");
    expect(parseRef("qa-0042")).toBe(42);
    expect(parseRef("42")).toBe(42);
    expect(parseRef("abc")).toBeNull();
  });
  test("text is trimmed, capped and stripped of control characters", () => {
    expect(cleanText("  hi\u0000 there\n ", 100)).toBe("hi there");
    expect(cleanText("x".repeat(10), 4)).toBe("xxxx");
  });
});

test("CSV defuses spreadsheet formulas", () => {
  const csv = qaCsv([{ ref_no: 1, created_at: "2026-11-22", category: "bug", status: "new", severity: null, title: "=HYPERLINK(\"x\")", reporter: "A", assignee: "", duplicate_of_ref: null, page_path: "/swap", browser: "", os: "", viewport: "", app_version: "", description: "a, b", expected: "", actual: "", steps: "" }]);
  const line = csv.split("\n")[1]!;
  expect(line).toContain(`"'=HYPERLINK(""x"")"`);
  expect(line).toContain('"a, b"');
});

describe("Telegram group posts", () => {
  const base = { ref: 7, category: "bug", title: "Swap <button> & stuck", description: "x".repeat(900), expected: "", actual: "It spins", steps: "1. Open swap",
    pagePath: "/swap?tab=x", reporter: "Cory", device: "Chrome 147 · Android · 390x844@3", files: 2, link: "https://seeds.honest.money/admin/bugs/7" };

  test("group ids look like Telegram chat ids", () => {
    expect(validTelegramChatId("-1004268049198")).toBe(true);
    for (const bad of ["", "abc", "-100abc", "@seeds", "12"]) expect(validTelegramChatId(bad)).toBe(false);
  });

  test("new report post: escaped, trimmed, counts files without sending them, links to Admin → Bugs", () => {
    const t = groupReportText(base);
    expect(t).toContain("QA-0007 · Bug");
    expect(t).toContain("Swap &lt;button&gt; &amp; stuck");
    expect(t).not.toContain("<button>");
    expect(t).toContain(`${"x".repeat(QA_GROUP_EXCERPT - 1)}…`);
    expect(t).not.toContain("x".repeat(QA_GROUP_EXCERPT));
    expect(t).toContain("📎 2 attachments");
    expect(t).not.toContain("Expected:");
    expect(t).toContain('href="https://seeds.honest.money/admin/bugs/7"');
  });

  test("status post names both statuses and who moved it", () => {
    const t = groupStatusText({ ref: 7, title: "Swap stuck", from: "ready_for_retest", to: "verified", by: "Cory retested", link: reportLink("https://seeds.honest.money/", 7) });
    expect(t).toContain("Ready for retest → <b>Verified</b>");
    expect(t).toContain("(Cory retested)");
    expect(t).toContain("https://seeds.honest.money/admin/bugs/7");
  });
});

describe("attachment storage must be private", () => {
  test("uploads only when the bucket clearly says private", async () => {
    const { bucketSafeForUploads } = await import("./qa-rules");
    expect(bucketSafeForUploads({ public: false })).toBe(true);
    expect(bucketSafeForUploads({ public: true })).toBe(false);
    expect(bucketSafeForUploads({})).toBe(false);
    expect(bucketSafeForUploads(null)).toBe(false);
  });
});

import { isOpenReport as _open } from "./qa-rules";
test("ignored reports leave the Open list", () => {
  expect(_open({ status: "ignored", duplicate_of: null })).toBe(false);
  expect(_open({ status: "new", duplicate_of: null })).toBe(true);
});
