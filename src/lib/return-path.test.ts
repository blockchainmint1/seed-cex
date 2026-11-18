import { describe, expect, test } from "bun:test";
import { markUsed, parseStored, safeReturnPath, shouldReplace, USED_GRACE_MS } from "./return-path";

describe("safeReturnPath", () => {
  test("keeps /register", () => expect(safeReturnPath("/register")).toBe("/register"));
  test("keeps affiliate ?ref= codes", () =>
    expect(safeReturnPath("/register?ref=janedoe")).toBe("/register?ref=janedoe"));
  test("keeps Peer Pay tokens with underscores", () =>
    expect(safeReturnPath("/pay/ab_C-9")).toBe("/pay/ab_C-9"));
  test("rejects other sites", () => {
    expect(safeReturnPath("https://evil.example/")).toBeNull();
    expect(safeReturnPath("//evil.example/")).toBeNull();
    expect(safeReturnPath("/\\evil.example")).toBeNull();
    expect(safeReturnPath("javascript:alert(1)")).toBeNull();
  });
  test("never returns to the sign-in pages", () => {
    expect(safeReturnPath("/auth")).toBeNull();
    expect(safeReturnPath("/sso?token=x")).toBeNull();
  });
});

describe("parseStored", () => {
  const now = 1_800_000_000_000;
  test("remembered page lasts 24 hours", () => {
    const v = JSON.stringify({ p: "/register", t: now - 23 * 3600_000 });
    expect(parseStored(v, now)).toBe("/register");
  });
  test("forgotten after 24 hours", () => {
    const v = JSON.stringify({ p: "/register", t: now - 25 * 3600_000 });
    expect(parseStored(v, now)).toBeNull();
  });
  test("accepts the old bare-path format", () => expect(parseStored("/register", now)).toBe("/register"));
});

describe("shouldReplace", () => {
  test("signing in from the home page keeps /register", () =>
    expect(shouldReplace("/register", "/")).toBe(false));
  test("signing in from another specific page replaces it", () =>
    expect(shouldReplace("/register", "/p2p")).toBe(true));
  test("home page is remembered when nothing else is", () =>
    expect(shouldReplace(null, "/")).toBe(true));
});

describe("used page stays readable briefly", () => {
  const now = 1_800_000_000_000;
  const fresh = JSON.stringify({ p: "/register", t: now - 60_000 });
  test("popup and opener both get /register within 2 minutes", () => {
    const used = markUsed(fresh, now);
    expect(parseStored(used, now + 30_000)).toBe("/register");
    expect(parseStored(markUsed(used, now + 30_000), now + USED_GRACE_MS)).toBe("/register");
  });
  test("forgotten 2 minutes after first use", () => {
    const used = markUsed(fresh, now);
    // a second read does not restart the 2-minute clock
    const again = markUsed(used, now + 90_000);
    expect(parseStored(again, now + USED_GRACE_MS + 1)).toBeNull();
  });
  test("grace is 2 minutes", () => expect(USED_GRACE_MS).toBe(120_000));
});
