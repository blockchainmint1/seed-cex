import { describe, expect, test as it } from "bun:test";
import { cleanRefCode, invoiceBelongs, invoiceSettled, referralUrl, seatsLeft } from "./ignite-registration";

const REG = "4cb2f720-947e-4c78-ba1c-ca20748d497a";
const LINK = "9a1b2c3d-0000-4000-8000-000000000001";

describe("seat confirmation", () => {
  it("a confirmed $400 invoice settles a $400 seat", () => expect(invoiceSettled({ status: "confirmed", fiat_amount: 400 }, 400)).toBe(true));
  it("an overpaid invoice still settles", () => expect(invoiceSettled({ status: "overpaid", fiat_amount: 400 }, 400)).toBe(true));
  it("a paid-but-unconfirmed invoice does not settle", () => expect(invoiceSettled({ status: "paid", fiat_amount: 400 }, 400)).toBe(false));
  it("an invoice for less than $400 does not settle", () => expect(invoiceSettled({ status: "confirmed", fiat_amount: 399 }, 400)).toBe(false));
  it("only Seeds' own order id for this seat counts", () => {
    expect(invoiceBelongs(`ignite-${REG}`, REG, null)).toBe(true);
    expect(invoiceBelongs(`ignite-peer-${LINK}`, REG, LINK)).toBe(true);
    expect(invoiceBelongs("ignite-someone-else", REG, LINK)).toBe(false);
    expect(invoiceBelongs(null, REG, null)).toBe(false);
  });
});

describe("seats left", () => {
  it("100 seats with 7 held leaves 93", () => expect(seatsLeft(7)).toBe(93));
  it("never shows fewer than 0", () => expect(seatsLeft(104)).toBe(0));
});

describe("referral link", () => {
  it("sends friends through honest.money to the Seeds registration page", () =>
    expect(referralUrl("Murdock")).toBe("https://honest.money/r/Murdock?to=https%3A%2F%2Fseeds.honest.money%2Fregister"));
  it("accepts normal codes and rejects junk", () => {
    expect(cleanRefCode(" janedoe ")).toBe("janedoe");
    expect(cleanRefCode("a b")).toBeNull();
    expect(cleanRefCode("x".repeat(65))).toBeNull();
    expect(cleanRefCode(undefined)).toBeNull();
  });
});
