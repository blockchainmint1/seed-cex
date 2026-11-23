import { describe, expect, test } from "bun:test";
import {
  canRegister, classPrice, classSpan, dateRangeLabel, interestRecipients, minerFromStatus, resolveMiner,
  sessionLines, sessionsLabel, sharedTimeLabel, upcomingClasses, validateClass, type ClassInput,
  zonedToUtc, utcToZoned, priceLine, photoSrc,
} from "./ignite-classes";

const TZ = "America/Chicago";
const spark = [
  { starts_at: "2026-12-05T19:00:00Z", ends_at: "2026-12-05T23:00:00Z" },
  { starts_at: "2026-12-06T19:00:00Z", ends_at: "2026-12-06T23:00:00Z" },
];
const first = [0, 1, 2, 3, 4].map((i) => ({
  starts_at: new Date(Date.UTC(2026, 10, 30 + i, 23)).toISOString(),
  ends_at: new Date(Date.UTC(2026, 10, 30 + i, 23, 90)).toISOString(),
}));

describe("class price", () => {
  test("Spark: $99 class fee plus $400 trade deposit = $499", () => {
    expect(classPrice({ feeUsd: 99, depositUsd: 400, minersFree: true }, "not_miner")).toEqual({ feeUsd: 99, minerDiscountUsd: 0, depositUsd: 400, totalUsd: 499 });
  });
  test("HME miners get the $99 class fee off and pay only the $400 deposit", () => {
    expect(classPrice({ feeUsd: 99, depositUsd: 400, minersFree: true }, "miner").totalUsd).toBe(400);
    expect(classPrice({ feeUsd: 99, depositUsd: 400, minersFree: true }, "miner").minerDiscountUsd).toBe(99);
  });
  test("an unknown miner status pays the full price (never guessed as a miner)", () => {
    expect(classPrice({ feeUsd: 99, depositUsd: 400, minersFree: true }, "unknown").totalUsd).toBe(499);
  });
  test("no discount when the class isn't free for miners", () => {
    expect(classPrice({ feeUsd: 99, depositUsd: 400, minersFree: false }, "miner").totalUsd).toBe(499);
  });
  test("Ignite (the first class) stays $400", () => {
    expect(classPrice({ feeUsd: 0, depositUsd: 400, minersFree: true }, "not_miner").totalUsd).toBe(400);
  });
});

describe("schedule wording", () => {
  test("Spark reads Dec 5–6, 1–5 PM Central", () => {
    expect(dateRangeLabel(spark, TZ)).toBe("December 5–6, 2026");
    expect(sharedTimeLabel(spark, TZ)).toBe("1:00–5:00 PM CST");
    expect(sessionsLabel(spark)).toBe("2 live sessions · 4 hours each");
    expect(sessionLines(spark, TZ)).toEqual(["Sat, December 5 · 1–5\u00a0PM CST", "Sun, December 6 · 1–5\u00a0PM CST"]);
  });
  test("Ignite (the first class) reads Nov 30–Dec 4, 5:00–6:30 PM Central", () => {
    expect(dateRangeLabel(first, TZ)).toBe("November 30–December 4, 2026");
    expect(sharedTimeLabel(first, TZ)).toBe("5:00–6:30 PM CST");
    expect(sessionsLabel(first)).toBe("5 live sessions · 90 minutes each");
  });
  test("span covers first start to last end", () => {
    expect(classSpan(spark)).toEqual({ startsAt: "2026-12-05T19:00:00.000Z", endsAt: "2026-12-06T23:00:00.000Z" });
  });
});

describe("who can register", () => {
  const now = Date.parse("2026-11-23T19:00:00Z");
  test("open with seats and not over", () => expect(canRegister({ status: "open", endsAt: "2026-12-06T23:00:00Z" }, 3, now)).toBe(true));
  test("full", () => expect(canRegister({ status: "open", endsAt: "2026-12-06T23:00:00Z" }, 0, now)).toBe(false));
  test("draft or closed", () => {
    expect(canRegister({ status: "draft", endsAt: null }, 5, now)).toBe(false);
    expect(canRegister({ status: "closed", endsAt: null }, 5, now)).toBe(false);
  });
  test("already over", () => expect(canRegister({ status: "open", endsAt: "2026-11-01T00:00:00Z" }, 5, now)).toBe(false));
  test("upcoming list hides drafts, finished and past classes, soonest first", () => {
    const list = [
      { slug: "spark", status: "open", startsAt: "2026-12-05T19:00:00Z", endsAt: "2026-12-06T23:00:00Z" },
      { slug: "ignite", status: "open", startsAt: "2026-11-30T23:00:00Z", endsAt: "2026-12-05T00:30:00Z" },
      { slug: "draft", status: "draft", startsAt: "2026-12-10T19:00:00Z", endsAt: "2026-12-10T23:00:00Z" },
      { slug: "old", status: "open", startsAt: "2026-10-01T19:00:00Z", endsAt: "2026-10-01T23:00:00Z" },
      { slug: "done", status: "done", startsAt: "2026-12-20T19:00:00Z", endsAt: "2026-12-20T23:00:00Z" },
    ];
    expect(upcomingClasses(list, now).map((c) => c.slug)).toEqual(["ignite", "spark"]);
  });
});

describe("Honest.Money miner status", () => {
  const id = "03ee869f-8726-48a7-80f8-286221d6436e";
  test("any hash power = miner", () => expect(minerFromStatus(id, { results: [{ hmeId: id, result: "found", miner: true, totalHashMhs: 12.5, checked: ["txc"] }] })).toBe("miner"));
  test("found, sites answered, zero hash = not a miner", () => expect(minerFromStatus(id, { results: [{ hmeId: id, result: "found", miner: false, totalHashMhs: 0, checked: ["txc", "zcu"] }] })).toBe("not_miner"));
  test("no site answered = unknown", () => expect(minerFromStatus(id, { results: [{ hmeId: id, result: "found", miner: null, totalHashMhs: 0, checked: [] }] })).toBe("unknown"));
  test("someone else's row or a bad answer = unknown", () => {
    expect(minerFromStatus(id, { results: [{ hmeId: "other", result: "found", miner: true, totalHashMhs: 5 }] })).toBe("unknown");
    expect(minerFromStatus(id, "<!doctype html>")).toBe("unknown");
    expect(minerFromStatus(id, { results: [{ hmeId: id, result: "not_found" }] })).toBe("unknown");
  });
  test("an admin's mark wins either way", () => {
    expect(resolveMiner(true, "not_miner")).toBe("miner");
    expect(resolveMiner(false, "miner")).toBe("not_miner");
    expect(resolveMiner(null, "unknown")).toBe("unknown");
  });
});

describe("class form", () => {
  const ok: ClassInput = {
    slug: "spark", name: "Spark", tagline: "", status: "open", instructorName: "Bobby Gray", instructorBio: "", instructorPhotoUrl: "",
    capacity: 100, feeUsd: 99, depositUsd: 400, minersFree: true, timezone: TZ, sessions: spark, location: "Live online",
    requirements: "", agenda: [], benefits: [],
  };
  test("a good class saves", () => expect(validateClass(ok)).toEqual({}));
  test("reserved or bad addresses are refused", () => {
    expect(validateClass({ ...ok, slug: "confirmed" }).slug).toBeTruthy();
    expect(validateClass({ ...ok, slug: "Spark Class" }).slug).toBeTruthy();
  });
  test("seats can't drop below seats already taken", () => expect(validateClass({ ...ok, capacity: 40 }, { held: 41 }).capacity).toBeTruthy());
  test("can't open without session times", () => expect(validateClass({ ...ok, sessions: [] }).sessions).toBeTruthy());
});

describe("interest list sends", () => {
  const rows = [
    { email: "a@x.com", unsubscribedAt: null, hasSeat: false },
    { email: "b@x.com", unsubscribedAt: "2026-11-01", hasSeat: false },
    { email: "c@x.com", unsubscribedAt: null, hasSeat: true },
  ];
  test("skips unsubscribed and seated people by default", () => expect(interestRecipients(rows, false).map((r) => r.email)).toEqual(["a@x.com"]));
  test("can include seated people, never unsubscribed", () => expect(interestRecipients(rows, true).map((r) => r.email)).toEqual(["a@x.com", "c@x.com"]));
});

describe("admin time entry", () => {
  test("Spark's 1 PM Central on Dec 5 is 19:00 UTC", () => {
    expect(zonedToUtc("2026-12-05", "13:00", "America/Chicago")).toBe("2026-12-05T19:00:00.000Z");
  });
  test("summer time uses the daylight offset", () => {
    expect(zonedToUtc("2027-06-05", "13:00", "America/Chicago")).toBe("2027-06-05T18:00:00.000Z");
  });
  test("round-trips to the same wall clock", () => {
    expect(utcToZoned("2026-12-05T19:00:00.000Z", "America/Chicago")).toEqual({ date: "2026-12-05", time: "13:00" });
    expect(utcToZoned("2026-12-01T05:30:00.000Z", "America/New_York")).toEqual({ date: "2026-12-01", time: "00:30" });
  });
  test("bad input gives null", () => {
    expect(zonedToUtc("12/05/2026", "13:00", "America/Chicago")).toBeNull();
  });
});

describe("display helpers", () => {
  test("Spark's headline price", () => {
    expect(priceLine({ feeUsd: 99, depositUsd: 400 })).toBe("$99 class + $400 trade deposit");
    expect(priceLine({ feeUsd: 0, depositUsd: 400 })).toBe("$400 trade deposit");
  });
  test("Seeds-hosted photos drop the host; others are untouched", () => {
    expect(photoSrc("https://seeds.honest.money/api/public/ignite-photo/abc")).toBe("/api/public/ignite-photo/abc");
    expect(photoSrc(null)).toBeNull();
  });
});
