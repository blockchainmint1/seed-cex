import { describe, expect, test } from "bun:test";
import { afterRun, DAY_MS, lastSlot, nextSlot } from "./check-schedule";

// Started 2:04 pm Buenos Aires (UTC-3) = 17:04 UTC on Nov 19 2026.
const started = "2026-11-19T17:04:00.000Z";
const at = (iso: string) => Date.parse(iso);

describe("each plan runs every 24 hours from when it was started", () => {
  test("started at 2:04 pm: the next check is 2:04 pm the next day", () => {
    expect(new Date(nextSlot(started, at("2026-11-19T17:04:30Z"))).toISOString()).toBe("2026-11-20T17:04:00.000Z");
  });
  test("a few days later it is still 2:04 pm", () => {
    expect(new Date(nextSlot(started, at("2026-11-23T09:00:00Z"))).toISOString()).toBe("2026-11-23T17:04:00.000Z");
    expect(new Date(lastSlot(started, at("2026-11-23T17:10:00Z"))).toISOString()).toBe("2026-11-23T17:04:00.000Z");
  });
  test("two plans started at different times get different times", () => {
    const other = "2026-11-19T08:30:00.000Z";
    expect(nextSlot(other, at("2026-11-20T00:00:00Z"))).not.toBe(nextSlot(started, at("2026-11-20T00:00:00Z")));
  });
});

describe("after a check", () => {
  test("a new check moves on to the next day's time", () => {
    expect(afterRun({ startedAt: started, now: at("2026-11-20T17:04:20Z"), newCheck: true })).toBe(at("2026-11-21T17:04:00Z"));
  });
  test("no new prices yet: retry in 5 minutes while the slot is under 3 hours old", () => {
    const now = at("2026-11-20T17:05:00Z");
    expect(afterRun({ startedAt: started, now, newCheck: false })).toBe(now + 5 * 60_000);
  });
  test("still no new prices 3 hours later: wait for the next day's time", () => {
    expect(afterRun({ startedAt: started, now: at("2026-11-20T20:05:00Z"), newCheck: false })).toBe(at("2026-11-21T17:04:00Z"));
  });
  test("a paused plan resumed late runs once, then goes back to its own time", () => {
    const now = at("2026-11-25T03:00:00Z");
    expect(afterRun({ startedAt: started, now, newCheck: true }) - lastSlot(started, now)).toBe(DAY_MS);
  });
});
