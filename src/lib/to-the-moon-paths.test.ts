import { describe, expect, test } from "bun:test";
import { moonClassPath } from "./to-the-moon-paths";

describe("old Ignite links", () => {
  test("the old First Class page lands on Ignite", () => expect(moonClassPath("first-class")).toBe("/to-the-moon/ignite"));
  test("other class addresses keep their name", () => expect(moonClassPath("spark")).toBe("/to-the-moon/spark"));
  test("a malformed address goes to the class list", () => expect(moonClassPath("../admin")).toBe("/to-the-moon"));
});
