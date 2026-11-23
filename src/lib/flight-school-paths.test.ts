import { describe, expect, test } from "bun:test";
import { flightSchoolClassPath } from "./flight-school-paths";

describe("old Ignite links", () => {
  test("the old First Class page lands on Spark", () => expect(flightSchoolClassPath("first-class")).toBe("/flight-school/spark"));
  test("other class addresses keep their name", () => expect(flightSchoolClassPath("ignite")).toBe("/flight-school/ignite"));
  test("a malformed address goes to the class list", () => expect(flightSchoolClassPath("../admin")).toBe("/flight-school"));
});
