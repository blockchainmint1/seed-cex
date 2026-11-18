import { describe, expect, test } from "bun:test";
import { timeLeft } from "./launch";

const START = "2026-11-30T23:00:00Z"; // first Ignite class, 5:00 PM CST

describe("launch countdown", () => {
  test("counts days, hours and minutes to the first class", () =>
    expect(timeLeft(new Date("2026-11-18T20:16:00Z").getTime(), START)).toEqual({ days: 12, hours: 2, minutes: 44, done: false }));
  test("stops at zero once the class has started", () =>
    expect(timeLeft(new Date("2026-12-01T00:00:00Z").getTime(), START)).toEqual({ days: 0, hours: 0, minutes: 0, done: true }));
});
