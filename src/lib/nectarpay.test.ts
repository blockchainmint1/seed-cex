import { describe, expect, test as it } from "bun:test";
import { createHmac } from "node:crypto";
import { verifyNectarSignature } from "./nectarpay.server";

const secret = "whsec_test";
const body = '{"id":"e1","type":"invoice.confirmed"}';
const sign = (t: number, b = body) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${b}`).digest("hex")}`;
const now = 1_800_000_000_000;

describe("NectarPay webhook signature", () => {
  it("accepts a fresh valid signature", async () => expect(await verifyNectarSignature(sign(now / 1000), body, secret, now)).toBe(true));
  it("rejects a tampered body", async () => expect(await verifyNectarSignature(sign(now / 1000), body + " ", secret, now)).toBe(false));
  it("rejects signatures older than 5 minutes", async () => expect(await verifyNectarSignature(sign(now / 1000 - 301), body, secret, now)).toBe(false));
  it("rejects a missing header", async () => expect(await verifyNectarSignature(null, body, secret, now)).toBe(false));
});
