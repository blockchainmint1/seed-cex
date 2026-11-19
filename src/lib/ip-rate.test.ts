import { describe, expect, test } from "bun:test";
import { IP_LIMITS, minuteWindow, withinLimit } from "./ip-rate";

describe("public endpoint rate limits", () => {
  test("windows are whole minutes", () => {
    expect(minuteWindow(Date.parse("2026-11-19T10:15:42.900Z"))).toBe("2026-11-19T10:15:00.000Z");
  });
  test("the 60th visit in a minute counts, the 61st doesn't", () => {
    expect(withinLimit(60, IP_LIMITS.track)).toBe(true);
    expect(withinLimit(61, IP_LIMITS.track)).toBe(false);
  });
  test("an unreadable count is not a pass", () => {
    expect(withinLimit(Number.NaN, IP_LIMITS.quote)).toBe(false);
  });
});
