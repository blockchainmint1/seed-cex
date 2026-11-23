import { describe, expect, test } from "bun:test";
import { APPLY_LIMIT_PER_DAY, canApply, cleanApplication, LISTING_PACKAGES, packageById } from "./listing";

const good = {
  package: "grove", coinName: "Example", ticker: "$exm", network: "pulsechain",
  contract: "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39", website: "example.org",
  community: "t.me/example", contactName: "Ana", contactEmail: "Ana@Example.org", contactTelegram: "@ana_team", notes: "",
};

describe("listing packages", () => {
  test("three packages at $1,000, $2,500 and $5,000", () => {
    expect(LISTING_PACKAGES.map((p) => [p.id, p.priceUsd])).toEqual([["sapling", 10000], ["grove", 25000], ["forest", 50000]]);
  });
  test("markets grow 1 → 2 → 3", () => {
    expect(LISTING_PACKAGES.map((p) => p.markets)).toEqual([1, 2, 3]);
  });
  test("trading contests come only with Sapling and Grove, and are marked as starting later", () => {
    expect(packageById("sapling")!.later ?? []).toEqual([]);
    expect(packageById("grove")!.later!.join(" ")).toContain("1 trading contest");
    expect(packageById("forest")!.later!.join(" ")).toContain("3 trading contests");
    expect(LISTING_PACKAGES.flatMap((p) => p.features).some((f) => /contest/i.test(f))).toBe(false);
  });
  test("every package opens the coin to Seeds AI baskets", () => {
    expect(packageById("sapling")!.features.some((f) => f.includes("AI basket"))).toBe(true);
  });
});

describe("cleanApplication", () => {
  test("tidies a good application", () => {
    const a = cleanApplication(good);
    expect(a.ticker).toBe("EXM");
    expect(a.website).toBe("https://example.org/");
    expect(a.community).toBe("https://t.me/example");
    expect(a.contactEmail).toBe("ana@example.org");
    expect(a.contactTelegram).toBe("ana_team");
    expect(a.notes).toBeNull();
  });
  test("refuses an unknown package", () => {
    expect(() => cleanApplication({ ...good, package: "platinum" })).toThrow("Pick a package.");
  });
  test("refuses a malformed EVM contract", () => {
    expect(() => cleanApplication({ ...good, contract: "0x1234" })).toThrow(/0x followed by 40/);
  });
  test("an Omni token is a property number", () => {
    expect(cleanApplication({ ...good, network: "texitcoin", contract: "39" }).contract).toBe("39");
    expect(() => cleanApplication({ ...good, network: "texitcoin", contract: "0xabc" })).toThrow(/property number/);
  });
  test("refuses a non-web website", () => {
    expect(() => cleanApplication({ ...good, website: "javascript:alert(1)" })).toThrow(/web address/);
  });
  test("needs a reachable email", () => {
    expect(() => cleanApplication({ ...good, contactEmail: "nope" })).toThrow(/email/);
  });
});

describe("apply limit", () => {
  test("3 applications per account per day", () => {
    expect(APPLY_LIMIT_PER_DAY).toBe(3);
    expect(canApply(2)).toBe(true);
    expect(canApply(3)).toBe(false);
  });
});

import {
  DEFAULT_PRICES, applicationIdFromOrderId, checkoutBlock, cleanPrices, cleanPromoCode, cleanPromoInput, listingInvoicePaid,
  listingOrderId, paymentActionAllowed, priceWithPromo, pricesFromRows, promoLabel, promoProblem, refundNeeded, type Promo,
} from "./listing";

describe("editable prices", () => {
  test("defaults are $1,000 / $2,500 / $5,000", () => {
    expect(DEFAULT_PRICES).toEqual({ sapling: 10000, grove: 25000, forest: 50000 });
  });
  test("stored prices replace the defaults; broken or missing rows fall back", () => {
    expect(pricesFromRows([{ package: "sapling", price_usd: "750" }, { package: "forest", price_usd: 0 }])).toEqual({ sapling: 750, grove: 25000, forest: 50000 });
    expect(pricesFromRows(null)).toEqual(DEFAULT_PRICES);
  });
  test("admin prices must be $1–$1,000,000 with at most 2 decimals", () => {
    expect(cleanPrices({ sapling: "$1,200", grove: 2500, forest: "4999.50" })).toEqual({ sapling: 1200, grove: 2500, forest: 4999.5 });
    expect(() => cleanPrices({ sapling: 0, grove: 2500, forest: 5000 })).toThrow(/Sapling price/);
    expect(() => cleanPrices({ sapling: 1000, grove: 2500.555, forest: 5000 })).toThrow(/2 decimals/);
  });
});

const promo = (p: Partial<Promo> = {}): Promo => ({ code: "LAUNCH", kind: "percent", value: 20, packages: null, maxUses: null, uses: 0, expiresAt: null, active: true, ...p });

describe("promo codes", () => {
  test("codes ignore case and spaces", () => {
    expect(cleanPromoCode(" launch 25 ")).toBe("LAUNCH25");
    expect(cleanPromoCode("ab")).toBeNull();
  });
  test("20% off Grove at $2,500 = $2,000", () => {
    expect(priceWithPromo(2500, { kind: "percent", value: 20 })).toEqual({ listPriceUsd: 2500, discountUsd: 500, amountUsd: 2000 });
  });
  test("$500 off Sapling at $1,000 = $500; a dollar discount never goes below zero", () => {
    expect(priceWithPromo(1000, { kind: "amount", value: 500 }).amountUsd).toBe(500);
    expect(priceWithPromo(1000, { kind: "amount", value: 5000 })).toEqual({ listPriceUsd: 1000, discountUsd: 1000, amountUsd: 0 });
  });
  test("100% off is free, and a balance under $1 is waived", () => {
    expect(priceWithPromo(5000, { kind: "percent", value: 100 }).amountUsd).toBe(0);
    expect(priceWithPromo(1000, { kind: "amount", value: 999.5 })).toEqual({ listPriceUsd: 1000, discountUsd: 1000, amountUsd: 0 });
  });
  test("paused, ended, used-up and wrong-package codes are refused", () => {
    const now = Date.parse("2026-11-23T12:00:00Z");
    expect(promoProblem(promo(), "sapling", now)).toBeNull();
    expect(promoProblem(promo({ active: false }), "sapling", now)).toBe("That code isn't valid.");
    expect(promoProblem(null, "sapling", now)).toBe("That code isn't valid.");
    expect(promoProblem(promo({ expiresAt: "2026-11-23T11:59:59Z" }), "sapling", now)).toBe("That code has ended.");
    expect(promoProblem(promo({ maxUses: 5, uses: 5 }), "sapling", now)).toBe("That code has been used up.");
    expect(promoProblem(promo({ packages: ["forest"] }), "sapling", now)).toBe("That code works only with Forest.");
  });
  test("admin input: percent is at most 100; ticking every package means all", () => {
    const now = Date.parse("2026-11-23T12:00:00Z");
    expect(() => cleanPromoInput({ code: "BIG", kind: "percent", value: 101 }, now)).toThrow(/100/);
    expect(cleanPromoInput({ code: "all3", kind: "amount", value: 250, packages: ["sapling", "grove", "forest"] }, now).packages).toBeNull();
    expect(() => cleanPromoInput({ code: "OLD", kind: "percent", value: 10, expiresAt: "2026-11-01" }, now)).toThrow(/future/);
  });
  test("labels", () => {
    expect(promoLabel({ kind: "percent", value: 25 })).toBe("25% off");
    expect(promoLabel({ kind: "amount", value: 500 })).toBe("$500 off");
  });
});

describe("NectarPay payment", () => {
  const id = "0b4f3a8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
  test("order id round-trips and nothing else is read as a listing", () => {
    expect(applicationIdFromOrderId(listingOrderId(id))).toBe(id);
    expect(applicationIdFromOrderId(`ignite-${id}`)).toBeNull();
  });
  test("an invoice counts only when confirmed, for at least the amount due, and for this application", () => {
    const app = { id, amount_usd: 2000 };
    expect(listingInvoicePaid({ status: "confirmed", fiat_amount: 2000, order_id: listingOrderId(id) }, app)).toBe(true);
    expect(listingInvoicePaid({ status: "confirmed", fiat_amount: 1999, order_id: listingOrderId(id) }, app)).toBe(false);
    expect(listingInvoicePaid({ status: "pending", fiat_amount: 2000, order_id: listingOrderId(id) }, app)).toBe(false);
    expect(listingInvoicePaid({ status: "confirmed", fiat_amount: 2000, order_id: `ignite-${id}` }, app)).toBe(false);
  });
  test("checkout opens right after applying (status new), but never for paid, free, part-paid or declined", () => {
    expect(checkoutBlock({ status: "new", payment_status: "unpaid", amount_usd: 1000 })).toBeNull();
    expect(checkoutBlock({ status: "new", payment_status: "pending", amount_usd: 1000 })).toBeNull();
    expect(checkoutBlock({ status: "new", payment_status: "paid", amount_usd: 1000 })).toMatch(/already paid/);
    expect(checkoutBlock({ status: "new", payment_status: "free", amount_usd: 0 })).toMatch(/Nothing to pay/);
    expect(checkoutBlock({ status: "new", payment_status: "underpaid", amount_usd: 1000 })).toMatch(/part of your payment/);
    expect(checkoutBlock({ status: "declined", payment_status: "unpaid", amount_usd: 1000 })).toMatch(/declined/);
  });
  test("a paid application that is declined needs a refund by hand", () => {
    expect(refundNeeded({ status: "declined", payment_status: "paid" })).toBe(true);
    expect(refundNeeded({ status: "declined", payment_status: "refunded" })).toBe(false);
    expect(paymentActionAllowed("mark_refunded", "paid")).toBe(true);
    expect(paymentActionAllowed("mark_refunded", "unpaid")).toBe(false);
    expect(paymentActionAllowed("mark_paid", "paid")).toBe(false);
  });
});
