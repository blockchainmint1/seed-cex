import { describe, expect, test } from "bun:test";
import { tsdSignature, verifyTsdWebhook, webhookOrderId, TSD_WEBHOOK_MAX_AGE_SEC } from "./tsd-webhook";

const secret = "test-signing-secret";
const body = JSON.stringify({ type: "payout_sent", order: { id: "833f5fc2-f630-4ed1-84ec-783daee8db21", status: "released" } });
const now = 1_795_000_000;

describe("TSD Bridge notifications", () => {
  test("a correctly signed, fresh notification is accepted", async () => {
    const sig = await tsdSignature(secret, String(now), body);
    expect(sig.startsWith("sha256=")).toBe(true);
    expect(await verifyTsdWebhook({ secret, timestamp: String(now), signature: sig, rawBody: body, nowSec: now + 10 })).toEqual({ ok: true });
  });
  test("a changed body or wrong secret is refused", async () => {
    const sig = await tsdSignature(secret, String(now), body);
    expect(await verifyTsdWebhook({ secret, timestamp: String(now), signature: sig, rawBody: body + " ", nowSec: now })).toEqual({ ok: false, reason: "bad_signature" });
    expect(await verifyTsdWebhook({ secret: "other", timestamp: String(now), signature: sig, rawBody: body, nowSec: now })).toEqual({ ok: false, reason: "bad_signature" });
  });
  test("older than 5 minutes is refused", async () => {
    expect(TSD_WEBHOOK_MAX_AGE_SEC).toBe(300);
    const sig = await tsdSignature(secret, String(now), body);
    expect(await verifyTsdWebhook({ secret, timestamp: String(now), signature: sig, rawBody: body, nowSec: now + 301 })).toEqual({ ok: false, reason: "stale" });
  });
  test("no secret set means nothing is accepted", async () => {
    expect(await verifyTsdWebhook({ secret: undefined, timestamp: String(now), signature: "sha256=00", rawBody: body, nowSec: now })).toEqual({ ok: false, reason: "no_secret" });
  });
  test("order id comes from order.id and must be a full id", () => {
    expect(webhookOrderId(JSON.parse(body))).toBe("833f5fc2-f630-4ed1-84ec-783daee8db21");
    expect(webhookOrderId({ order: { id: "TX-1234ABCD" } })).toBeNull();
    expect(webhookOrderId({})).toBeNull();
  });
});
