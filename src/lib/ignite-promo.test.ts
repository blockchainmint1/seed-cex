import { describe, expect, test } from "bun:test";
import { shouldShowIgnitePromo } from "./ignite-registration";

const START = "2026-11-30T23:00:00Z";
const before = new Date("2026-11-20T12:00:00Z").getTime();
const DAY = 24 * 3600_000;

describe("homepage Ignite popup", () => {
  test("shows to a new visitor before the class starts", () =>
    expect(shouldShowIgnitePromo({ now: before, dismissedAt: null, seatsLeft: 72, startUtc: START })).toBe(true));
  test("never shows once the class has started", () =>
    expect(shouldShowIgnitePromo({ now: new Date(START).getTime(), dismissedAt: null, seatsLeft: 72, startUtc: START })).toBe(false));
  test("stays hidden for 3 days after being closed", () =>
    expect(shouldShowIgnitePromo({ now: before, dismissedAt: before - 3 * DAY + 60_000, seatsLeft: 72, startUtc: START })).toBe(false));
  test("comes back after 3 days", () =>
    expect(shouldShowIgnitePromo({ now: before, dismissedAt: before - 3 * DAY, seatsLeft: 72, startUtc: START })).toBe(true));
  test("hides when all 100 seats are held", () =>
    expect(shouldShowIgnitePromo({ now: before, dismissedAt: null, seatsLeft: 0, startUtc: START })).toBe(false));
  test("hides for someone whose seat is already paid", () =>
    expect(shouldShowIgnitePromo({ now: before, dismissedAt: null, seatsLeft: 72, myStatus: "confirmed", startUtc: START })).toBe(false));
  test("still shows to someone who started but hasn't paid", () =>
    expect(shouldShowIgnitePromo({ now: before, dismissedAt: null, seatsLeft: 72, myStatus: "pending", startUtc: START })).toBe(true));
});
