import { describe, expect, test } from "bun:test";
import {
  QA_REPORTS_PER_HOUR, cleanText, describeDevice, duplicateProblem, fileProblem, parseRef, qaCsv, refLabel, retestResult, scrubPagePath, viewportLabel,
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
