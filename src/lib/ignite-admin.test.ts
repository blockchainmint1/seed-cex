import { describe, expect, test } from "bun:test";
import { filterIgniteRows, hideBlock, paragraphs, personalize, reminderBlock, sortIgniteRows, validateMessage, REMINDER_COOLDOWN_HOURS } from "./ignite-admin";

const NOW = Date.parse("2026-11-18T20:00:00Z");

describe("payment reminders", () => {
  test("an unpaid seat with no reminder yet can get one", () => {
    expect(reminderBlock("pending", null, NOW)).toBeNull();
    expect(reminderBlock("expired", null, NOW)).toBeNull();
    expect(reminderBlock("underpaid", null, NOW)).toBeNull();
  });
  test("paid and cancelled seats never get a payment link", () => {
    expect(reminderBlock("confirmed", null, NOW)).toBe("Already paid.");
    expect(reminderBlock("canceled", null, NOW)).toBe("Seat was cancelled.");
  });
  test("one reminder per 12 hours per person", () => {
    expect(REMINDER_COOLDOWN_HOURS).toBe(12);
    expect(reminderBlock("pending", new Date(NOW - 11 * 3_600_000).toISOString(), NOW)).toContain("1 hour");
    expect(reminderBlock("pending", new Date(NOW - 12 * 3_600_000).toISOString(), NOW)).toBeNull();
  });
});

describe("admin messages", () => {
  test("subject and body are required", () => {
    expect(validateMessage({ subject: "", body: "" })).toEqual({ subject: "Add a subject.", body: "Write a short message." });
    expect(validateMessage({ subject: "Zoom link", body: "Here is the link for Monday." })).toEqual({});
  });
  test("{first} becomes the registrant's first name", () => {
    expect(personalize("Hi {first}, see you Monday", "Jennifer Hommel")).toBe("Hi Jennifer, see you Monday");
  });
  test("blank lines split paragraphs", () => {
    expect(paragraphs("One\n\nTwo\nstill two\n\n\nThree")).toEqual(["One", "Two\nstill two", "Three"]);
  });
});

const row = (o: Partial<Parameters<typeof filterIgniteRows>[0][number]>) => ({
  fullName: "A", email: "a@x.com", phone: "+1 5", status: "pending", refCode: null, payerName: null,
  createdAt: "2026-11-18T10:00:00Z", paidUsd: null, lastEmailedAt: null, ...o,
});

describe("registrant table", () => {
  const rows = [
    row({ fullName: "Mel", status: "confirmed", paidUsd: 400, createdAt: "2026-11-17T10:00:00Z" }),
    row({ fullName: "jennifer", email: "jen@x.com", status: "expired" }),
    row({ fullName: "Shauna", status: "canceled", refCode: "bobby" }),
  ];
  test("search finds by name, email or referrer", () => {
    expect(filterIgniteRows(rows, "JEN", "all").map((r) => r.fullName)).toEqual(["jennifer"]);
    expect(filterIgniteRows(rows, "bobby", "all").map((r) => r.fullName)).toEqual(["Shauna"]);
  });
  test("'unpaid' shows only seats that still owe the deposit", () => {
    expect(filterIgniteRows(rows, "", "unpaid").map((r) => r.fullName)).toEqual(["jennifer"]);
  });
  test("sorting by name ignores capital letters", () => {
    expect(sortIgniteRows(rows, "fullName", "asc").map((r) => r.fullName)).toEqual(["jennifer", "Mel", "Shauna"]);
  });
  test("empty values stay at the bottom both ways", () => {
    expect(sortIgniteRows(rows, "paidUsd", "asc")[0]!.fullName).toBe("Mel");
    expect(sortIgniteRows(rows, "paidUsd", "desc")[0]!.fullName).toBe("Mel");
  });
  test("sorting by status puts paid seats first", () => {
    expect(sortIgniteRows(rows, "status", "asc").map((r) => r.status)).toEqual(["confirmed", "expired", "canceled"]);
  });
});

describe("hiding sign-ups from the Registrants list", () => {
  test("paid and short-paid seats can never be hidden", () => {
    expect(hideBlock("confirmed", null, NOW)).not.toBeNull();
    expect(hideBlock("underpaid", null, NOW)).not.toBeNull();
  });
  test("cancelled and old unpaid sign-ups can be hidden", () => {
    expect(hideBlock("canceled", null, NOW)).toBeNull();
    expect(hideBlock("pending", new Date(NOW - 60_000).toISOString(), NOW)).toBeNull();
    expect(hideBlock("pending", null, NOW)).toBeNull();
  });
  test("someone paying right now stays on the list", () => {
    expect(hideBlock("pending", new Date(NOW + 60_000).toISOString(), NOW)).toBe("They have a checkout open right now.");
  });
});
