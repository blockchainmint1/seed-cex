import { describe, expect, test } from "bun:test";
import { catchupSteps, closeFromSnapshots, dayToFill } from "./price-catchup";

const at = (iso: string) => Date.parse(iso);

describe("chasing yesterday's close right after the day ends", () => {
  test("asks for it one minute after midnight UTC (9:01 pm Buenos Aires)", () => {
    expect(catchupSteps(at("2026-11-20T00:01:00Z")).request).toBe(true);
  });
  test("keeps asking every 10 minutes through the first hours", () => {
    expect(catchupSteps(at("2026-11-20T00:11:00Z")).request).toBe(true);
    expect(catchupSteps(at("2026-11-20T03:51:00Z")).request).toBe(true);
    expect(catchupSteps(at("2026-11-20T00:12:00Z")).request).toBe(false);
  });
  test("stops asking later in the day", () => {
    expect(catchupSteps(at("2026-11-20T04:01:00Z")).request).toBe(false);
    expect(catchupSteps(at("2026-11-20T17:01:00Z")).request).toBe(false);
  });
  test("saves finished downloads every 5 minutes while chasing", () => {
    expect(catchupSteps(at("2026-11-20T00:03:00Z")).ingest).toBe(true);
    expect(catchupSteps(at("2026-11-20T00:08:00Z")).ingest).toBe(true);
  });
  test("Seeds' own record stands in only from 20 minutes after midnight", () => {
    expect(catchupSteps(at("2026-11-20T00:14:00Z")).fill).toBe(false);
    expect(catchupSteps(at("2026-11-20T00:24:00Z")).fill).toBe(true);
  });
});

describe("which day gets a stand-in close", () => {
  test("yesterday, when the day before is stored", () => {
    expect(dayToFill("2026-11-18", at("2026-11-20T00:24:00Z"))).toBe("2026-11-19");
  });
  test("nothing once yesterday is stored", () => {
    expect(dayToFill("2026-11-19", at("2026-11-20T00:24:00Z"))).toBeNull();
  });
  test("never papers over a longer gap", () => {
    expect(dayToFill("2026-11-16", at("2026-11-20T00:24:00Z"))).toBeNull();
  });
});

describe("the close from Seeds' own 5-minute record", () => {
  const rows = [
    { bucket: "2026-11-19T23:55:00Z", price: 61957, asset_tor_price: 61957.4, live: true },
    { bucket: "2026-11-20T00:00:00Z", price: 61825, asset_tor_price: 61792.3, live: true },
    { bucket: "2026-11-20T00:05:00Z", price: 61906, asset_tor_price: 61942.1, live: true },
  ];
  test("uses the record taken at midnight", () => {
    expect(closeFromSnapshots(rows, "2026-11-19")).toBe(61792.3);
  });
  test("ignores records more than 10 minutes from midnight", () => {
    expect(closeFromSnapshots([{ bucket: "2026-11-20T00:15:00Z", price: 1, asset_tor_price: 1, live: true }], "2026-11-19")).toBeNull();
  });
  test("ignores a market that wasn't live", () => {
    expect(closeFromSnapshots([{ ...rows[1]!, live: false }], "2026-11-19")).toBeNull();
  });
});
