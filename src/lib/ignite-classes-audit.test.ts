import { describe, expect, test } from "bun:test";
import { minerCacheMs, minerCheckState, seatMoveProblem, shouldLogMinerFailure } from "./ignite-classes";

const NOW = Date.parse("2026-11-23T20:00:00Z");

describe("miner check health (auditor K1)", () => {
  test("an unknown answer is remembered only 30 seconds", () => {
    expect(minerCacheMs("unknown")).toBe(30_000);
  });
  test("a firm miner / not-miner answer is remembered 5 minutes", () => {
    expect(minerCacheMs("miner")).toBe(300_000);
    expect(minerCacheMs("not_miner")).toBe(300_000);
  });
  test("a failure logs when the last one was 5+ minutes ago", () => {
    expect(shouldLogMinerFailure("2026-11-23T19:55:00Z", NOW)).toBe(true);
    expect(shouldLogMinerFailure(null, NOW)).toBe(true);
  });
  test("a failure within 5 minutes of the last one is not logged again", () => {
    expect(shouldLogMinerFailure("2026-11-23T19:56:00Z", NOW)).toBe(false);
  });
  test("the check reads as down when the latest answer was a failure", () => {
    expect(minerCheckState({ lastOkAt: "2026-11-23T19:00:00Z", lastFailAt: "2026-11-23T19:30:00Z" })).toBe("down");
    expect(minerCheckState({ lastOkAt: "2026-11-23T19:40:00Z", lastFailAt: "2026-11-23T19:30:00Z" })).toBe("ok");
  });
});

describe("admin seat moves (auditor K4)", () => {
  const open = { name: "Spark", status: "open", endsAt: "2026-12-13T23:00:00Z", capacity: 100 };
  test("an open class with room accepts the seat", () => {
    expect(seatMoveProblem(open, 99, false, NOW)).toBeNull();
  });
  test("a full class refuses the seat", () => {
    expect(seatMoveProblem(open, 100, false, NOW)).toBe("Spark is full (100 of 100 seats taken).");
  });
  test("a finished class refuses the seat", () => {
    expect(seatMoveProblem({ ...open, status: "done" }, 0, false, NOW)).toBe("Spark has already finished.");
    expect(seatMoveProblem({ ...open, endsAt: "2026-11-01T00:00:00Z" }, 0, false, NOW)).toBe("Spark has already finished.");
  });
  test("a closed class with room still accepts an admin's move", () => {
    expect(seatMoveProblem({ ...open, status: "closed" }, 0, false, NOW)).toBeNull();
  });
  test("a draft class needs the admin's OK", () => {
    expect(seatMoveProblem({ ...open, status: "draft" }, 0, false, NOW)).toMatch(/still a draft/);
    expect(seatMoveProblem({ ...open, status: "draft" }, 0, true, NOW)).toBeNull();
  });
});
