import { describe, expect, test as it } from "bun:test";
import { validateDetails, normalizeEmail, SEAT_CAPACITY, DEPOSIT_USD } from "./ignite-registration";

const ok = { fullName: "Ada Lovelace", email: "Ada@Example.com ", countryCode: "+1", phone: "555 123 4567", marketingOptIn: false };

describe("registration rules", () => {
  it("caps the class at 100 seats", () => expect(SEAT_CAPACITY).toBe(100));
  it("deposit is $400", () => expect(DEPOSIT_USD).toBe(400));
  it("accepts valid details", () => expect(validateDetails(ok)).toEqual({}));
  it("rejects bad email", () => expect(validateDetails({ ...ok, email: "nope" }).email).toBeDefined());
  it("rejects short phone", () => expect(validateDetails({ ...ok, phone: "12" }).phone).toBeDefined());
  it("normalizes email for dedupe", () => expect(normalizeEmail(" Ada@Example.COM ")).toBe("ada@example.com"));
});

import { SCHEDULE_START_UTC, SCHEDULE_END_UTC } from "./ignite-registration";
describe("schedule", () => {
  it("starts Nov 30 2026 at 5:00 PM CST", () => expect(new Date(SCHEDULE_START_UTC).getTime()).toBe(Date.parse("2026-11-30T17:00:00-06:00")));
  it("last session ends Dec 4 at 6:30 PM CST, 90 min after start", () => {
    const end = new Date(SCHEDULE_END_UTC).getTime();
    expect(end).toBe(Date.parse("2026-12-04T18:30:00-06:00"));
    expect(end - Date.parse("2026-12-04T17:00:00-06:00")).toBe(90 * 60000);
  });
});
