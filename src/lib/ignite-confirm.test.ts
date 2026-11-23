import { describe, expect, test as it } from "bun:test";
import { cleanRefCode, inviteLabel, inviteUrl, invoiceBelongs, invoiceSettled, referralUrl, seatsLeft } from "./ignite-registration";

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
  it("members share a short Seeds invite link", () =>
    expect(inviteUrl("CryptoCoryency")).toBe("https://seeds.honest.money/invite/CryptoCoryency"));
  it("the invite link reads without https://", () =>
    expect(inviteLabel("https://seeds.honest.money/invite/CryptoCoryency")).toBe("seeds.honest.money/invite/CryptoCoryency"));
  it("sends friends through honest.money to the Seeds registration page", () =>
    expect(referralUrl("Murdock")).toBe("https://honest.money/r/Murdock?to=https%3A%2F%2Fseeds.honest.money%2Fignite"));
  it("accepts normal codes and rejects junk", () => {
    expect(cleanRefCode(" janedoe ")).toBe("janedoe");
    expect(cleanRefCode("a b")).toBeNull();
    expect(cleanRefCode("x".repeat(65))).toBeNull();
    expect(cleanRefCode(undefined)).toBeNull();
  });
});

import { seatNoticesDue } from "./ignite-registration";
describe("seat-confirmed notices are retried when cut off", () => {
  const NOW = Date.parse("2026-11-23T18:10:00Z");
  const row = (o: Partial<{ status: string; confirmed_at: string | null; notices_done_at: string | null }>) =>
    ({ status: "confirmed", confirmed_at: "2026-11-23T18:01:41Z", notices_done_at: null, ...o });
  it("a paid seat with no notices 8 minutes later is due", () => expect(seatNoticesDue(row({}), NOW)).toBe(true));
  it("not within the first 2 minutes (the payment notice may still be sending)", () =>
    expect(seatNoticesDue(row({ confirmed_at: "2026-11-23T18:09:00Z" }), NOW)).toBe(false));
  it("never again once notices are done", () => expect(seatNoticesDue(row({ notices_done_at: "2026-11-23T18:02:00Z" }), NOW)).toBe(false));
  it("never for an unpaid or cancelled seat", () => {
    expect(seatNoticesDue(row({ status: "pending" }), NOW)).toBe(false);
    expect(seatNoticesDue(row({ status: "cancelled" }), NOW)).toBe(false);
  });
  it("gives up after 3 days", () => expect(seatNoticesDue(row({ confirmed_at: "2026-11-20T18:00:00Z" }), NOW)).toBe(false));
});
