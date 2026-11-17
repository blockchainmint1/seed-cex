import { expect, test } from "bun:test";
import { omniSymbolForProperty, parseOmniSendPayload } from "./ignite-asset.server";
import { paidInLabel } from "./ignite-registration";

// The real OP_RETURN from the $400 Ignite payment that funded the invoice address
// TeeqfN7CGEQFKoa6s2XeKnv8XzkbioKohH: "omni" + property 39 (TSD) + 400.00000000.
const REAL_TSD_PAYMENT = "6a146f6d6e69000000000000002700000009502f9000";

test("reads the asset and amount out of a real TSD payment", () => {
  expect(parseOmniSendPayload(REAL_TSD_PAYMENT)).toEqual({ propertyId: 39, amount: 400 });
});

test("property 39 is TSD and 43 is wBTC", () => {
  expect(omniSymbolForProperty(39)).toBe("TSD");
  expect(omniSymbolForProperty(43)).toBe("wBTC");
  expect(omniSymbolForProperty(9999)).toBeNull();
});

test("a payload with a version/type prefix still reads property and amount", () => {
  // "omni" + version+type (00000000) + property 39 + amount 1.0 (100000000 satoshis)
  expect(parseOmniSendPayload("6a186f6d6e690000000000000000000000270000000005f5e100")).toEqual({ propertyId: 39, amount: 1 });
});

test("anything that isn't a simple send reads as no asset", () => {
  expect(parseOmniSendPayload(null)).toBeNull();
  expect(parseOmniSendPayload("")).toBeNull();
  expect(parseOmniSendPayload("76a9143aa258d87269e5958bcb7b46df58f92e0a1f194288ac")).toBeNull(); // plain payout
  expect(parseOmniSendPayload("6a086f6d6e69000000")).toBeNull(); // too short to hold property + amount
  expect(parseOmniSendPayload("6a146f6d6e690000000000000027zzzzzzzzzzzzzzzz")).toBeNull(); // not hex
});

test("the label names the asset, and the chain it settled on", () => {
  expect(paidInLabel("TSD", "txc")).toBe("TSD on TXC");
  expect(paidInLabel("TXC", "txc")).toBe("TXC"); // native payment: no "on TXC" doubling
  expect(paidInLabel(null, "txc")).toBe("TXC"); // asset unknown: chain alone, as before
  expect(paidInLabel("TSD", null)).toBe("TSD");
  expect(paidInLabel(null, null)).toBeNull();
});
